import {
  pgTable,
  uuid,
  varchar,
  numeric,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { users } from "./users";

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "completed",
  "failed",
  "cancelled",
]);

export const billingCycleEnum = pgEnum("billing_cycle", ["weekly", "monthly", "yearly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "cancelled"]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  initiatedBy: uuid("initiated_by").references(() => users.id, { onDelete: "set null" }),
  txRef: varchar("tx_ref", { length: 255 }).notNull().unique(),
  status: transactionStatusEnum("status").default("pending").notNull(),
  planTier: varchar("plan_tier", { length: 50 }).notNull(),
  billingCycle: billingCycleEnum("billing_cycle").notNull(),
  // numeric(10,2) handles Flutterwave's float amounts correctly (e.g. 2500.00)
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// subscriptions has a self-referential FK to transactions — defined after transactions
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  planTier: varchar("plan_tier", { length: 50 }).notNull(),
  billingCycle: billingCycleEnum("billing_cycle").notNull(),
  status: subscriptionStatusEnum("status").default("active").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  nextRenewalDate: timestamp("next_renewal_date"),
  lastTransactionId: uuid("last_transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  // Recurring billing fields — null means one-time payment
  flwPlanId: varchar("flw_plan_id", { length: 50 }),           // Flutterwave plan ID
  flwSubscriptionId: varchar("flw_subscription_id", { length: 100 }), // FLW subscription token
  isRecurring: boolean("is_recurring").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
