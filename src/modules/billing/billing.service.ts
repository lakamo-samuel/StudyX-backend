import axios from "axios";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";
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
      redirect_url: `${env.CLIENT_URL}/settings?billing=success&tx_ref=${txRef}`,
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

  // Store a pending transaction immediately so webhook can look up plan/cycle by txRef
  await db
    .insert(transactions)
    .values({
      txRef,
      groupId: group.id,
      status: "pending",
      amount: String(amount),
      currency: "NGN",
      planTier: input.plan,
      billingCycle: input.cycle,
      paymentMethod: "flutterwave",
      initiatedBy: userId,
    })
    .onConflictDoNothing();

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
  const secretHash = env.FLUTTERWAVE_WEBHOOK_SECRET;

  // SECURITY: Webhook secret is REQUIRED. Reject all requests without it.
  // Set FLUTTERWAVE_WEBHOOK_SECRET in your environment variables.
  // Use a strong random value (e.g. openssl rand -hex 32) and set the same
  // value as "Secret Hash" in Flutterwave dashboard → Settings → Webhooks.
  if (!secretHash) {
    console.error("[webhook] FLUTTERWAVE_WEBHOOK_SECRET is not set — rejecting webhook");
    throw new AppError("Webhook verification not configured", 503);
  }

  if (!rawSignature) {
    throw new AppError("Webhook signature header missing", 401);
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(secretHash);
  const received = Buffer.from(rawSignature);
  const signaturesMatch =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);

  if (!signaturesMatch) {
    throw new AppError("Invalid webhook signature", 401);
  }

  // Flutterwave sends tx_ref as snake_case for card payments and camelCase txRef for bank transfers
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const rawStatus = (data.status ?? payload.status) as string | undefined;
  const status = rawStatus ? rawStatus.toLowerCase() : "";
  const txRef = (
    data.tx_ref ?? data.txRef ?? data.reference ??
    payload.tx_ref ?? payload.txRef ?? payload.reference
  ) as string | undefined;

  if (!txRef) throw new AppError("Missing transaction reference", 400);

  // Validate txRef format to prevent injection — must be our own format or a short alphanumeric ref
  // Only allow: letters, digits, hyphens, underscores (no SQL special chars, no path traversal)
  if (!/^[a-zA-Z0-9_\-]+$/.test(txRef) || txRef.length > 255) {
    throw new AppError("Invalid transaction reference format", 400);
  }

  // Extract meta — handle flat, nested, and array structures.
  // For bank transfers, meta may be absent — fall back to parsing txRef.
  let extractedGroupId: string | undefined;
  let extractedTargetPlan: BillingPlanInput = "pro"; // sensible default
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

  // If meta is absent (e.g. bank transfer webhook), look up the pending transaction
  // we created when checkout was initialized — it has the plan/cycle stored
  if (!extractedGroupId && txRef) {
    const [pendingTx] = await db
      .select({
        groupId:      transactions.groupId,
        planTier:     transactions.planTier,
        billingCycle: transactions.billingCycle,
        initiatedBy:  transactions.initiatedBy,
      })
      .from(transactions)
      .where(eq(transactions.txRef, txRef))
      .limit(1);

    if (pendingTx) {
      extractedGroupId     = pendingTx.groupId;
      extractedTargetPlan  = pendingTx.planTier as BillingPlanInput;
      extractedCycle       = pendingTx.billingCycle as BillingCycleInput;
      extractedInitiatedBy = pendingTx.initiatedBy ?? null;
    }
  }

  // Final fallback: parse groupId from txRef format vyrdly_<groupId>_<timestamp>
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


// ── Verify payment by transaction ID (called from redirect URL) ───────────────
// Flutterwave appends ?transaction_id=xxx&tx_ref=yyy&status=successful to the redirect.
// We verify directly with their API so the plan activates even if the webhook was delayed/lost.

export const verifyPaymentByTransactionId = async (
  transactionId: string,
  txRef: string,
  userId: string,
) => {
  // Idempotency: already processed by webhook
  const [existing] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.txRef, txRef))
    .limit(1);

  if (existing?.status === "completed") {
    return { alreadyProcessed: true, message: "Plan already activated" };
  }

  if (!env.FLUTTERWAVE_SECRET_KEY) {
    return { alreadyProcessed: false, message: "No Flutterwave key configured (test mode)" };
  }

  const { data: resp } = await axios.get(
    `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
    { headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` } },
  );

  const txData = resp?.data as Record<string, unknown> | undefined;
  if (!txData || (txData.status as string) !== "successful") {
    throw new AppError("Payment verification failed or not successful", 400);
  }

  const meta   = (txData.meta ?? {}) as Record<string, unknown>;
  const groupId = (meta.groupId ?? meta.group_id) as string | undefined;

  // Fall back to parsing tx_ref
  let resolvedGroupId = groupId;
  if (!resolvedGroupId && txRef.startsWith("vyrdly_")) {
    const withoutPrefix  = txRef.slice("vyrdly_".length);
    const lastUnderscore = withoutPrefix.lastIndexOf("_");
    resolvedGroupId = lastUnderscore > 0 ? withoutPrefix.slice(0, lastUnderscore) : withoutPrefix;
  }

  if (!resolvedGroupId) throw new AppError("Could not resolve groupId from payment", 400);

  const planTier    = ((meta.targetPlan ?? meta.target_plan ?? "free") as BillingPlanInput);
  const billingCycle = ((meta.cycle ?? "monthly") as BillingCycleInput);
  const amount      = String(txData.amount ?? 0);
  const currency    = (txData.currency as string) ?? "NGN";
  const startDate   = new Date();
  const endDate     = calcEndDate(billingCycle, startDate);

  const [newTx] = await db
    .insert(transactions)
    .values({
      txRef,
      groupId: resolvedGroupId,
      status: "completed",
      amount,
      currency,
      planTier,
      billingCycle,
      paymentMethod: "flutterwave",
      completedAt: new Date(),
      initiatedBy: isUUID(userId) ? userId : null,
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
      planTier,
      billingCycle,
      status: "active",
      startDate,
      endDate,
      nextRenewalDate: endDate,
      lastTransactionId: newTx.id,
    })
    .onConflictDoUpdate({
      target: subscriptions.groupId,
      set: {
        planTier,
        billingCycle,
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
    .set({ planTier, updatedAt: new Date() })
    .where(eq(groups.id, resolvedGroupId));

  return { alreadyProcessed: false, message: "Plan activated via verification", groupId: resolvedGroupId, planTier };
};

// ── Type-safe Flutterwave verify response ─────────────────────────────────────

interface FlutterwaveVerifyData {
  id:              number;
  tx_ref:          string;
  flw_ref:         string;
  status:          string;
  amount:          number;
  charged_amount:  number;
  currency:        string;
  payment_type:    string;
  meta:            Record<string, string> | null;
  customer: {
    id:       number;
    email:    string;
    fullName: string;
  };
}

interface FlutterwaveVerifyResponse {
  status:  string;   // "success" | "error"
  message: string;
  data:    FlutterwaveVerifyData | null;
}

// ── verifyPaymentByTxRef ──────────────────────────────────────────────────────
// Called after Flutterwave redirects back to the app with a tx_ref param.
// 1. Check if already processed (idempotent)
// 2. Look up the transaction ID from Flutterwave's transaction list by tx_ref
// 3. Verify the transaction directly with Flutterwave
// 4. Activate the plan if payment is successful

export const verifyPaymentByTxRef = async (
  txRef: string,
  userId: string,
): Promise<{
  alreadyProcessed: boolean;
  success: boolean;
  message: string;
  groupId?: string;
  planTier?: string;
}> => {
  // Step 1 — Idempotency check: already processed by webhook?
  const [existing] = await db
    .select({
      status:  transactions.status,
      groupId: transactions.groupId,
      planTier: transactions.planTier,
    })
    .from(transactions)
    .where(eq(transactions.txRef, txRef))
    .limit(1);

  if (existing?.status === "completed") {
    return {
      alreadyProcessed: true,
      success: true,
      message: "Payment already processed — plan is active",
      groupId: existing.groupId,
      planTier: existing.planTier,
    };
  }

  // Step 2 — Can't verify without the API key
  if (!env.FLUTTERWAVE_SECRET_KEY) {
    return {
      alreadyProcessed: false,
      success: false,
      message: "Payment verification skipped — no Flutterwave key configured",
    };
  }

  // Step 3 — Look up transaction by tx_ref via Flutterwave search API
  const searchResp = await axios.get<{ status: string; data: { data: FlutterwaveVerifyData[] } }>(
    `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(txRef)}`,
    { headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` } },
  );

  const txList = searchResp.data?.data?.data ?? [];
  const txEntry = txList[0];

  if (!txEntry) {
    return {
      alreadyProcessed: false,
      success: false,
      message: "Transaction not found on Flutterwave — may still be processing",
    };
  }

  // Step 4 — Verify the transaction ID directly
  const verifyResp = await axios.get<FlutterwaveVerifyResponse>(
    `https://api.flutterwave.com/v3/transactions/${txEntry.id}/verify`,
    { headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` } },
  );

  const txData = verifyResp.data?.data;

  if (!txData || txData.status !== "successful") {
    return {
      alreadyProcessed: false,
      success: false,
      message: `Payment status: ${txData?.status ?? "unknown"}`,
    };
  }

  // Step 5 — Parse meta safely
  const meta       = (txData.meta ?? {}) as Record<string, string>;
  const planTier   = (meta.targetPlan  ?? meta.target_plan  ?? "pro")     as BillingPlanInput;
  const cycle      = (meta.cycle       ?? "monthly")                       as BillingCycleInput;
  const metaUserId = meta.initiatedBy ?? meta.initiated_by ?? null;

  // Resolve groupId from meta first, then fall back to tx_ref parsing
  let resolvedGroupId = (meta.groupId ?? meta.group_id) as string | undefined;
  if (!resolvedGroupId && txRef.startsWith("vyrdly_")) {
    const withoutPrefix  = txRef.slice("vyrdly_".length);
    const lastUnderscore = withoutPrefix.lastIndexOf("_");
    resolvedGroupId = lastUnderscore > 0
      ? withoutPrefix.slice(0, lastUnderscore)
      : withoutPrefix;
  }

  if (!resolvedGroupId || !isUUID(resolvedGroupId)) {
    throw new AppError(`Could not resolve groupId from tx_ref: ${txRef}`, 400);
  }

  const initiatedBy: string | null = isUUID(metaUserId)
    ? metaUserId
    : isUUID(userId) ? userId : null;

  // Step 6 — Activate plan
  const startDate = new Date();
  const endDate   = calcEndDate(cycle, startDate);

  const [newTx] = await db
    .insert(transactions)
    .values({
      txRef,
      groupId:       resolvedGroupId,
      status:        "completed",
      amount:        String(txData.charged_amount ?? txData.amount ?? 0),
      currency:      txData.currency ?? "NGN",
      planTier,
      billingCycle:  cycle,
      paymentMethod: "flutterwave",
      completedAt:   new Date(),
      initiatedBy,
    })
    .onConflictDoUpdate({
      target: transactions.txRef,
      set: { status: "completed", completedAt: new Date() },
    })
    .returning();

  await db
    .insert(subscriptions)
    .values({
      groupId:           resolvedGroupId,
      planTier,
      billingCycle:      cycle,
      status:            "active",
      startDate,
      endDate,
      nextRenewalDate:   endDate,
      lastTransactionId: newTx.id,
    })
    .onConflictDoUpdate({
      target: subscriptions.groupId,
      set: {
        planTier,
        billingCycle:      cycle,
        status:            "active",
        startDate,
        endDate,
        nextRenewalDate:   endDate,
        lastTransactionId: newTx.id,
        updatedAt:         new Date(),
      },
    });

  await db
    .update(groups)
    .set({ planTier, updatedAt: new Date() })
    .where(eq(groups.id, resolvedGroupId));

  return {
    alreadyProcessed: false,
    success:  true,
    message:  "Payment verified and plan activated",
    groupId:  resolvedGroupId,
    planTier,
  };
};
