import { Router, type RequestHandler } from "express";
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

// Flutterwave webhook — no auth, no rate limit, must receive raw JSON
// express-rate-limit is applied globally in app.ts but we skip it here
// by mounting this route before the rate-limiter would normally fire.
// The route is registered on the billing router which is mounted at /api/billing,
// making the full path: POST /api/billing/webhooks/flutterwave
const skipRateLimit: RequestHandler = (_req, _res, next) => next()
router.post("/webhooks/flutterwave", skipRateLimit, flutterwaveWebhookController);

// Get billing details for a specific group (admin only)
router.get("/groups/:groupId", authenticate, getGroupBillingController);

export default router;
