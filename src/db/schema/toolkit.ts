import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { users } from "./users";

export const fileTypeEnum = pgEnum("file_type", [
  "pdf",
  "docx",
  "txt",
  "image",
  "other",
]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  type: fileTypeEnum("type").default("other").notNull(),
  hasAiSummary: boolean("has_ai_summary").default(false).notNull(),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
