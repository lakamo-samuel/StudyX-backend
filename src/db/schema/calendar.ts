/**
 * Calendar schema — stores user calendar connections and session events.
 * Supports Google Calendar and Outlook (future) OAuth integrations.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { sessions } from "./sessions";

export const calendarProviderEnum = pgEnum("calendar_provider", [
  "google",
  "outlook",
]);

/**
 * Stores OAuth tokens for a user's connected calendar account.
 * One row per user per provider.
 */
export const calendarConnections = pgTable("calendar_connections", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  provider:     calendarProviderEnum("provider").notNull(),
  accessToken:  text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiry:  timestamp("token_expiry"),
  calendarId:   varchar("calendar_id", { length: 255 }), // provider-side calendar ID
  isActive:     boolean("is_active").default(true).notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Tracks which sessions have been synced to a user's calendar.
 * Stores the provider event ID so we can update/delete the event later.
 */
export const calendarEvents = pgTable("calendar_events", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  sessionId:       uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
  connectionId:    uuid("connection_id").references(() => calendarConnections.id, { onDelete: "cascade" }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 512 }).notNull(), // Google/Outlook event ID
  syncedAt:        timestamp("synced_at").defaultNow().notNull(),
  updatedAt:       timestamp("updated_at").defaultNow().notNull(),
});

export type CalendarConnection    = typeof calendarConnections.$inferSelect;
export type NewCalendarConnection = typeof calendarConnections.$inferInsert;
export type CalendarEvent         = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent      = typeof calendarEvents.$inferInsert;
