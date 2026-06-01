import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters"),
  subject: z.string().min(1, "Subject is required"),
  goal: z.string().min(1, "Goal is required"),
  visibility: z.enum(["public", "private"]).default("private"),
});

export const updateGroupSchema = z.object({
  name: z.string().min(2).optional(),
  subject: z.string().optional(),
  goal: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const changeMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
