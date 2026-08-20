import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const visibilityEnum = pgEnum("visibility", ["public", "private"]);
export const memberRoleEnum = pgEnum("member_role", ["admin", "member"]);
export const memberStatusEnum = pgEnum("member_status", ["pending", "approved", "rejected", "invited"]);
export const planTierEnum = pgEnum("plan_tier", ["free", "pro", "commercial"]);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  goal: text("goal").notNull(),
  visibility: visibilityEnum("visibility").default("private").notNull(),
  planTier: planTierEnum("plan_tier").default("free").notNull(),
  adminId: uuid("admin_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const groupMembers = pgTable("group_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: memberRoleEnum("role").default("member").notNull(),
  status: memberStatusEnum("status").default("approved").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export const groupInviteLinks = pgTable("group_invite_links", {
  id:        uuid("id").primaryKey().defaultRandom(),
  groupId:   uuid("group_id").references(() => groups.id, { onDelete: "cascade" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token:     varchar("token", { length: 64 }).notNull().unique(),
  maxUses:   integer("max_uses"),           // null = unlimited
  useCount:  integer("use_count").default(0).notNull(),
  expiresAt: timestamp("expires_at"),       // null = never expires
  isActive:  boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GroupInviteLink    = typeof groupInviteLinks.$inferSelect;
export type NewGroupInviteLink = typeof groupInviteLinks.$inferInsert;
