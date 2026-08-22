import { Router, type RequestHandler } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  flutterwaveWebhookController,
  getPlansController,
  initializeCheckoutController,
  getGroupBillingController,
  verifyPaymentController,
  cancelSubscriptionController,
} from "./billing.controller";
import { initializeCheckoutSchema } from "./billing.schema";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/plans", getPlansController);

// ── Flutterwave webhook (no auth, bypass rate limit) ─────────────────────────
const skipRateLimit: RequestHandler = (_req, _res, next) => next();
router.post("/webhooks/flutterwave", skipRateLimit, flutterwaveWebhookController);

// ── Authenticated ─────────────────────────────────────────────────────────────
router.post(
  "/checkout/initialize",
  authenticate,
  validate(initializeCheckoutSchema),
  initializeCheckoutController,
);

// Verify payment by txRef after Flutterwave redirect — idempotent fallback
router.post("/verify", authenticate, verifyPaymentController);

// Group billing status (admin only)
router.get("/groups/:groupId", authenticate, getGroupBillingController);

// Cancel recurring subscription (admin only)
router.delete("/groups/:groupId/subscription", authenticate, cancelSubscriptionController);

export default router;
