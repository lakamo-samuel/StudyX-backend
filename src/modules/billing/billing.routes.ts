import { Router, type RequestHandler } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  flutterwaveWebhookController,
  getPlansController,
  initializeCheckoutController,
  getGroupBillingController,
  verifyPaymentController,
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

// Verify payment by tx_ref after Flutterwave redirect — idempotent fallback
// Body: { txRef: string }
router.post("/verify", authenticate, verifyPaymentController);

// Group billing status (admin only)
router.get("/groups/:groupId", authenticate, getGroupBillingController);

export default router;
