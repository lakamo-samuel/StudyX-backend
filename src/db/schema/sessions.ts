import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { users } from "./users";

export const sessionStatusEnum = pgEnum("session_status", [
  "scheduled",
  "ready",
  "active",
  "ended",
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  status: sessionStatusEnum("status").default("scheduled").notNull(),
  goal: text("goal"),
  scheduledDate: varchar("scheduled_date", { length: 50 }),
  scheduledTime: varchar("scheduled_time", { length: 20 }),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  /** AI-generated session debrief — populated by summarize-session job after session ends */
  aiSummary: text("ai_summary"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessionAgenda = pgTable("session_agenda", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  topic: text("topic").notNull(),
  timeBlock: varchar("time_block", { length: 50 }),
  done: boolean("done").default(false).notNull(),
  order: integer("order").default(0).notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionAgenda = typeof sessionAgenda.$inferSelect;
export type NewSessionAgenda = typeof sessionAgenda.$inferInsert;
