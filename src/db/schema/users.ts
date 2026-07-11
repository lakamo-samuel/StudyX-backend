import { pgTable, uuid, varchar, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  university: varchar("university", { length: 255 }),
  course: varchar("course", { length: 255 }),
  year: integer("year"),
  avatar: text("avatar"),
  streak: integer("streak").default(0),
  // Onboarding fields — persisted from step 2 and step 3
  goals: jsonb("goals").$type<string[]>().default([]),
  availability: jsonb("availability").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert