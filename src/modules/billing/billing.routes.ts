import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  flutterwaveWebhookController,
  getPlansController,
  initializeCheckoutController,
  getGroupBillingController,
} from "./billing.controller";
import { initializeCheckoutSchema } from "./billing.schema";

const router = Router();

router.get("/plans", getPlansController);

router.post(
  "/checkout/initialize",
  authenticate,
  validate(initializeCheckoutSchema),
  initializeCheckoutController,
);

// Flutterwave sends a raw POST — no auth middleware
router.post("/webhooks/flutterwave", flutterwaveWebhookController);

// Get billing details for a specific group (admin only)
router.get("/groups/:groupId", authenticate, getGroupBillingController);

export default router;
