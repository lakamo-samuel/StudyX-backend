import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  university: z.string().optional(),
  course: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  avatar: z.string().url().optional(),
  goals: z.array(z.string()).max(3, "Maximum 3 goals").optional(),
  availability: z.array(z.string()).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
