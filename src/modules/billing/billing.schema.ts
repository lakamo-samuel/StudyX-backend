import { z } from "zod";

export const billingPlanSchema = z.enum(["free", "pro", "commercial"]);
export const billingCycleSchema = z.enum(["weekly", "monthly", "yearly"]);

export const initializeCheckoutSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  plan: billingPlanSchema,
  cycle: billingCycleSchema,
});

export const webhookSchema = z.object({
  event: z.string().optional(),
  data: z.unknown().optional(),
});

export type BillingPlanInput = z.infer<typeof billingPlanSchema>;
export type BillingCycleInput = z.infer<typeof billingCycleSchema>;
export type InitializeCheckoutInput = z.infer<typeof initializeCheckoutSchema>;