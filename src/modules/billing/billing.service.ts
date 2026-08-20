import axios from "axios";
import { and, desc, eq } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../config/db";
import { groups, groupMembers } from "../../db/schema/groups";
import { users } from "../../db/schema/users";
import { transactions, subscriptions } from "../../db/schema/billing";
import { AppError } from "../../middleware/error.middleware";
import type { BillingCycleInput, BillingPlanInput, InitializeCheckoutInput } from "./billing.schema";
import { PLAN_LIMITS } from "./entitlements";

// ── Pricing (single source of truth for amounts) ─────────────────────────────
// Yearly prices apply a discount: Pro=30% off monthly×12, Commercial=20% off monthly×12

const MONTHLY_PRICE: Record<Exclude<BillingPlanInput, "free">, number> = {
  pro: 2500,
  commercial: 15000,
};

const YEARLY_DISCOUNT: Record<Exclude<BillingPlanInput, "free">, number> = {
  pro: 0.30,        // 30% off
  commercial: 0.20, // 20% off
};

const WEEKLY_PRICE: Record<Exclude<BillingPlanInput, "free">, number> = {
  pro: 1000,
  commercial: 5000,
};

function getPriceForPlan(plan: BillingPlanInput, cycle: BillingCycleInput): number {
  if (plan === "free") return 0;
  if (cycle === "weekly")  return WEEKLY_PRICE[plan];
  if (cycle === "monthly") return MONTHLY_PRICE[plan];
  // yearly: monthly × 12 × (1 - discount)
  return Math.round(MONTHLY_PRICE[plan] * 12 * (1 - YEARLY_DISCOUNT[plan]));
}

// ── Subscription end-date calculator ─────────────────────────────────────────

function calcEndDate(cycle: BillingCycleInput, from: Date = new Date()): Date {
  const end = new Date(from);
  if (cycle === "weekly")  end.setDate(end.getDate() + 7);
  if (cycle === "monthly") end.setMonth(end.getMonth() + 1);
  if (cycle === "yearly")  end.setFullYear(end.getFullYear() + 1);
  return end;
}

// ── Guard: group admin ────────────────────────────────────────────────────────

const assertGroupAdmin = async (groupId: string, userId: string) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);

  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AppError("Only group admins can manage billing", 403);
  }

  return group;
};

// ── Public service functions ──────────────────────────────────────────────────

export const getPlans = async () => {
  const plans = (["free", "pro", "commercial"] as BillingPlanInput[]).reduce(
    (acc, plan) => {
      const limits = PLAN_LIMITS[plan];
      acc[plan] = {
        name: plan === "pro" ? "Student Pro" : plan.charAt(0).toUpperCase() + plan.slice(1),
        weekly:  getPriceForPlan(plan, "weekly"),
        monthly: getPriceForPlan(plan, "monthly"),
        yearly:  getPriceForPlan(plan, "yearly"),
        yearlyDiscount: plan !== "free" ? YEARLY_DISCOUNT[plan as Exclude<BillingPlanInput, "free">] : 0,
        limits: {
          maxMembersPerGroup:        limits.maxMembersPerGroup,
          maxQuizQuestionsPerSession: limits.maxQuizQuestionsPerSession,
          monthlyToolkitSummaries:   limits.monthlyToolkitSummaries,
        },
      };
      return acc;
    },
    {} as Record<string, unknown>,
  );

  return {
    currency: "NGN",
    provider: "flutterwave",
    plans,
  };
};

export const initializeCheckout = async (
  userId: string,
  input: InitializeCheckoutInput,
) => {
  const group = await assertGroupAdmin(input.groupId, userId);

  if (input.plan === "free") {
    await db
      .update(groups)
      .set({ planTier: "free", updatedAt: new Date() })
      .where(eq(groups.id, input.groupId));

    return {
      message: "Group switched to free plan",
      plan: "free",
      groupId: input.groupId,
      checkoutUrl: null,
      mode: "free" as const,
    };
  }

  const amount = getPriceForPlan(input.plan, input.cycle);
  const txRef = `vyrdly_${group.id}_${Date.now()}`;

  if (!env.FLUTTERWAVE_SECRET_KEY) {
    return {
      provider: "flutterwave",
      mode: "dry-run" as const,
      txRef,
      amount,
      currency: "NGN",
      checkoutUrl: null,
      message: "Flutterwave secret key not configured. Set FLUTTERWAVE_SECRET_KEY to enable live checkout.",
    };
  }

  // Fetch the initiating admin's real email for Flutterwave customer field
  const [admin] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const customerEmail = admin?.email ?? `admin-${userId}@vyrdly.com`;
  const customerName  = admin?.name  ?? group.name;

  const { data } = await axios.post(
    "https://api.flutterwave.com/v3/payments",
    {
      tx_ref: txRef,
      amount,
      currency: "NGN",
      redirect_url: `${env.CLIENT_URL}/settings?billing=success`,
      customer: {
        email: customerEmail,
        name:  customerName,
      },
      customizations: {
        title: "Vyrdly Subscription",
        description: `${input.plan} (${input.cycle}) plan for ${group.name}`,
      },
      meta: {
        groupId:     group.id,
        targetPlan:  input.plan,
        cycle:       input.cycle,
        initiatedBy: userId,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  return {
    provider: "flutterwave",
    mode: "live" as const,
    txRef,
    amount,         // send as number to Flutterwave API
    currency: "NGN",
    checkoutUrl: data?.data?.link ?? null,
  };
};

const isUUID = (str: unknown): str is string =>
  typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export const handleWebhook = async (
  payload: Record<string, unknown>,
  rawSignature: string | undefined,
) => {
  const secretKey = env.FLUTTERWAVE_SECRET_KEY;
  const secretHash = env.FLUTTERWAVE_SECRET_HASH;

  // Flutterwave sends the secret in the verif-hash header (or custom configured Secret Hash)
  if (secretKey || secretHash) {
    if (!rawSignature) {
      throw new AppError("Webhook signature header missing", 401);
    }
    const matchesKey = secretKey && rawSignature === secretKey;
    const matchesHash = secretHash && rawSignature === secretHash;
    if (!matchesKey && !matchesHash) {
      throw new AppError("Invalid webhook signature", 401);
    }
  }

  // Flutterwave payload structure:
  // { event: "charge.completed", data: { status, tx_ref, amount, currency, meta: { groupId, targetPlan, cycle, initiatedBy } } }
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const rawStatus = (data.status ?? payload.status) as string | undefined;
  const status = rawStatus ? rawStatus.toLowerCase() : "";
  const txRef = (data.tx_ref ?? data.reference ?? payload.tx_ref ?? payload.reference) as string | undefined;

  if (!txRef) throw new AppError("Missing transaction reference", 400);

  // Extract meta fields — handle flat object, nested object, and array structures
  let extractedGroupId: string | undefined;
  let extractedTargetPlan: BillingPlanInput = "free";
  let extractedCycle: BillingCycleInput = "monthly";
  let extractedInitiatedBy: string | null = null;

  const rawMeta = data.meta ?? payload.meta;

  if (Array.isArray(rawMeta)) {
    for (const item of rawMeta as Record<string, unknown>[]) {
      const k = (item.metaname || item.name || item.key) as string;
      const v = (item.metavalue || item.value) as string;
      if (k === "groupId" || k === "group_id") extractedGroupId = v;
      if (k === "targetPlan" || k === "target_plan") extractedTargetPlan = v as BillingPlanInput;
      if (k === "cycle") extractedCycle = v as BillingCycleInput;
      if (k === "initiatedBy" || k === "initiated_by") extractedInitiatedBy = v;
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    const m = rawMeta as Record<string, unknown>;
    if (Array.isArray(m.metaData)) {
      for (const item of m.metaData as Record<string, unknown>[]) {
        const k = (item.metaname || item.name || item.key) as string;
        const v = (item.metavalue || item.value) as string;
        if (k === "groupId" || k === "group_id") extractedGroupId = v;
        if (k === "targetPlan" || k === "target_plan") extractedTargetPlan = v as BillingPlanInput;
        if (k === "cycle") extractedCycle = v as BillingCycleInput;
        if (k === "initiatedBy" || k === "initiated_by") extractedInitiatedBy = v;
      }
    }
    extractedGroupId = extractedGroupId ?? ((m.groupId ?? m.group_id) as string | undefined);
    extractedTargetPlan = (m.targetPlan ?? m.target_plan ?? extractedTargetPlan) as BillingPlanInput;
    extractedCycle = (m.cycle ?? extractedCycle) as BillingCycleInput;
    extractedInitiatedBy = (m.initiatedBy ?? m.initiated_by ?? extractedInitiatedBy) as string | null;
  }

  // groupId comes from meta — fall back to parsing tx_ref if meta is missing
  // tx_ref format: vyrdly_<groupId>_<timestamp> where groupId is a UUID
  let resolvedGroupId = extractedGroupId;
  if ((!resolvedGroupId || !isUUID(resolvedGroupId)) && txRef.startsWith("vyrdly_")) {
    const withoutPrefix = txRef.slice("vyrdly_".length);
    const lastUnderscore = withoutPrefix.lastIndexOf("_");
    const candidate = lastUnderscore > 0 ? withoutPrefix.slice(0, lastUnderscore) : withoutPrefix;
    if (isUUID(candidate)) {
      resolvedGroupId = candidate;
    }
  }

  if (!resolvedGroupId || !isUUID(resolvedGroupId)) {
    throw new AppError(`Could not resolve valid groupId from webhook (got: '${resolvedGroupId}')`, 400);
  }

  // Ensure target group exists in database
  const [existingGroup] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, resolvedGroupId))
    .limit(1);

  if (!existingGroup) {
    throw new AppError(`Group ${resolvedGroupId} not found in database`, 404);
  }

  // Sanitize initiatedBy to ensure valid UUID or null to avoid PostgreSQL DB error
  const validInitiatedBy = isUUID(extractedInitiatedBy) ? extractedInitiatedBy : null;

  const [existingTx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.txRef, txRef))
    .limit(1);

  // Idempotency: skip if already processed successfully
  if (existingTx?.status === "completed") {
    return { success: true, message: "Already processed", txRef, groupId: resolvedGroupId };
  }

  const isSuccessful = ["successful", "completed", "succeeded"].includes(status);

  if (isSuccessful) {
    const amount = String(data.amount ?? payload.amount ?? 0);
    const startDate = new Date();
    const endDate = calcEndDate(extractedCycle, startDate);

    const [newTx] = await db
      .insert(transactions)
      .values({
        txRef,
        groupId: resolvedGroupId,
        status: "completed",
        amount,
        currency: (data.currency as string) ?? (payload.currency as string) ?? "NGN",
        planTier: extractedTargetPlan,
        billingCycle: extractedCycle,
        paymentMethod: "flutterwave",
        completedAt: new Date(),
        initiatedBy: validInitiatedBy,
      })
      .onConflictDoUpdate({
        target: transactions.txRef,
        set: { status: "completed", completedAt: new Date() },
      })
      .returning();

    await db
      .insert(subscriptions)
      .values({
        groupId: resolvedGroupId,
        planTier: extractedTargetPlan,
        billingCycle: extractedCycle,
        status: "active",
        startDate,
        endDate,
        nextRenewalDate: endDate,
        lastTransactionId: newTx.id,
      })
      .onConflictDoUpdate({
        target: subscriptions.groupId,
        set: {
          planTier: extractedTargetPlan,
          billingCycle: extractedCycle,
          status: "active",
          startDate,
          endDate,
          nextRenewalDate: endDate,
          lastTransactionId: newTx.id,
          updatedAt: new Date(),
        },
      });

    await db
      .update(groups)
      .set({ planTier: extractedTargetPlan, updatedAt: new Date() })
      .where(eq(groups.id, resolvedGroupId));

    return {
      success: true,
      message: "Payment processed and plan activated",
      txRef,
      groupId: resolvedGroupId,
      plan: extractedTargetPlan,
    };
  }

  const isFailed = ["failed", "declined", "cancelled"].includes(status);

  if (isFailed) {
    const newStatus = status === "cancelled" ? "cancelled" : "failed";

    await db
      .insert(transactions)
      .values({
        txRef,
        groupId: resolvedGroupId,
        status: newStatus,
        amount: String(data.amount ?? payload.amount ?? 0),
        currency: (data.currency as string) ?? (payload.currency as string) ?? "NGN",
        planTier: extractedTargetPlan,
        billingCycle: extractedCycle,
        paymentMethod: "flutterwave",
        initiatedBy: validInitiatedBy,
      })
      .onConflictDoUpdate({
        target: transactions.txRef,
        set: { status: newStatus },
      });

    return { success: false, message: `Payment ${newStatus}`, txRef, groupId: resolvedGroupId };
  }

  return { success: false, message: "Unhandled payment status", status, txRef };
};

export const getGroupBilling = async (groupId: string, userId: string) => {
  const group = await assertGroupAdmin(groupId, userId);

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.groupId, groupId))
    .limit(1);

  const recentTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.groupId, groupId))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  return {
    group: {
      id:       group.id,
      name:     group.name,
      planTier: group.planTier,
    },
    subscription: subscription ?? null,
    transactions: recentTransactions,
  };
};

