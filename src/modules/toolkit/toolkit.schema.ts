import { z } from "zod";

export const saveFileSchema = z.object({
  name: z.string().min(1, "File name is required"),
  url: z.string().url("Invalid file URL"),
  type: z.enum(["pdf", "docx", "txt", "image", "other"]),
  groupId: z.string().uuid("Invalid group ID"),
});

export const updateFileSchema = z.object({
  name: z.string().min(1).optional(),
});

export type SaveFileInput = z.infer<typeof saveFileSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;
