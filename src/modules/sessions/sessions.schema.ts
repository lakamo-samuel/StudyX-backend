import { z } from "zod";

export const createSessionSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  title: z.string().min(2, "Title must be at least 2 characters"),
  goal: z.string().optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
});

export const updateSessionSchema = z.object({
  title: z.string().min(2).optional(),
  goal: z.string().optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
});

export const updateSessionStatusSchema = z.object({
  status: z.enum(["scheduled", "ready", "active", "ended"]),
});

export const createAgendaItemSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  timeBlock: z.string().optional(),
  order: z.number().int().default(0),
});

export const updateAgendaItemSchema = z.object({
  topic: z.string().optional(),
  timeBlock: z.string().optional(),
  done: z.boolean().optional(),
  order: z.number().int().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type UpdateSessionStatusInput = z.infer<
  typeof updateSessionStatusSchema
>;
export type CreateAgendaItemInput = z.infer<typeof createAgendaItemSchema>;
export type UpdateAgendaItemInput = z.infer<typeof updateAgendaItemSchema>;
