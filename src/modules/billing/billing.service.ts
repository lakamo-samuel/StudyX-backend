import axios from "axios";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";
import { env } from "../../config/env";
import { db } from "../../config/db";
import { groups, groupMembers } from "../../db/schema/groups";
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

  const { data } = await axios.post(
    "https://api.flutterwave.com/v3/payments",
    {
      tx_ref: txRef,
      amount,
      currency: "NGN",
      redirect_url: `${env.CLIENT_URL}/settings?billing=success`,
      customer: {
        email: `group-${group.id}@vyrdly.local`,
        name: group.name,
      },
      customizations: {
        title: "Vyrdly Subscription",
        description: `${input.plan} (${input.cycle}) plan for ${group.name}`,
      },
      meta: {
        groupId: group.id,
        targetPlan: input.plan,
        cycle: input.cycle,
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
    amount,
    currency: "NGN",
    checkoutUrl: data?.data?.link ?? null,
  };
};

export const handleWebhook = async (
  payload: Record<string, unknown>,
  rawSignature: string | undefined,
) => {
  // Flutterwave sends the secret in the verif-hash header
  if (!env.FLUTTERWAVE_SECRET_KEY || !rawSignature) {
    throw new AppError("Webhook signature verification failed", 401);
  }

  if (rawSignature !== env.FLUTTERWAVE_SECRET_KEY) {
    throw new AppError("Invalid webhook signature", 401);
  }

  // Flutterwave payload structure:
  // { event: "charge.completed", data: { status, tx_ref, amount, currency, meta: { groupId, targetPlan, cycle, initiatedBy } } }
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const status = data.status as string;
  const txRef  = (data.tx_ref ?? data.reference) as string | undefined;

  // meta can be nested under data.meta or data.meta.metaData (Flutterwave v3)
  const rawMeta = (data.meta ?? {}) as Record<string, unknown>;

  // Extract meta fields — handle both flat and nested structures
  const groupId    = (rawMeta.groupId ?? rawMeta.group_id) as string | undefined;
  const targetPlan = (rawMeta.targetPlan ?? rawMeta.target_plan ?? "free") as BillingPlanInput;
  const cycle      = (rawMeta.cycle ?? "monthly") as BillingCycleInput;
  const initiatedBy = (rawMeta.initiatedBy ?? rawMeta.initiated_by ?? null) as string | null;

  if (!txRef) throw new AppError("Missing transaction reference", 400);

  // groupId comes from meta — fall back to parsing tx_ref if meta is missing
  // tx_ref format: vyrdly_<groupId>_<timestamp> where groupId is a UUID (has hyphens)
  let resolvedGroupId = groupId;
  if (!resolvedGroupId && txRef.startsWith("vyrdly_")) {
    // Remove prefix "vyrdly_" and suffix "_<timestamp>" (last underscore segment)
    const withoutPrefix = txRef.slice("vyrdly_".length);
    const lastUnderscore = withoutPrefix.lastIndexOf("_");
    resolvedGroupId = lastUnderscore > 0 ? withoutPrefix.slice(0, lastUnderscore) : withoutPrefix;
  }

  if (!resolvedGroupId) throw new AppError("Could not resolve groupId from webhook", 400);

  const [existingTx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.txRef, txRef))
    .limit(1);

  // Idempotency: skip if already processed successfully
  if (existingTx?.status === "completed") {
    return { success: true, message: "Already processed", txRef, groupId: resolvedGroupId };
  }

  if (status === "successful" || status === "completed") {
    const amount    = (data.amount as number) ?? 0;
    const startDate = new Date();
    const endDate   = calcEndDate(cycle, startDate);

    const [newTx] = await db
      .insert(transactions)
      .values({
        txRef,
        groupId: resolvedGroupId,
        status: "completed",
        amount,
        currency: (data.currency as string) ?? "NGN",
        planTier: targetPlan,
        billingCycle: cycle,
        paymentMethod: "flutterwave",
        completedAt: new Date(),
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
        groupId: resolvedGroupId,
        planTier: targetPlan,
        billingCycle: cycle,
        status: "active",
        startDate,
        endDate,
        nextRenewalDate: endDate,
        lastTransactionId: newTx.id,
      })
      .onConflictDoUpdate({
        target: subscriptions.groupId,
        set: {
          planTier: targetPlan,
          billingCycle: cycle,
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
      .set({ planTier: targetPlan, updatedAt: new Date() })
      .where(eq(groups.id, resolvedGroupId));

    return { success: true, message: "Payment processed and plan activated", txRef, groupId: resolvedGroupId };
  }

  if (status === "failed" || status === "declined" || status === "cancelled") {
    const newStatus = status === "cancelled" ? "cancelled" : "failed";

    await db
      .insert(transactions)
      .values({
        txRef,
        groupId: resolvedGroupId,
        status: newStatus,
        amount: (data.amount as number) ?? 0,
        currency: (data.currency as string) ?? "NGN",
        planTier: targetPlan,
        billingCycle: cycle,
        paymentMethod: "flutterwave",
        initiatedBy,
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

