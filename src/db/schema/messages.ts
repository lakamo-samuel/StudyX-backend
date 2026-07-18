import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { users } from "./users";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => sessions.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  text: text("text").notNull(),
  /** True when this message is part of an AI chat thread (not group chat) */
  isAiChat: boolean("is_ai_chat").default(false).notNull(),
  /** True when this message is an AI response (false = student message) */
  isAiResponse: boolean("is_ai_response").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

