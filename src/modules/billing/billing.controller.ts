import { NextFunction, Request, Response } from "express";
import * as billingService from "./billing.service";
import type { InitializeCheckoutInput } from "./billing.schema";

export const getPlansController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await billingService.getPlans();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const initializeCheckoutController = async (
  req: Request<Record<string, never>, unknown, InitializeCheckoutInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await billingService.initializeCheckout(req.user!.userId, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const flutterwaveWebhookController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const signature = (
      req.headers["verif-hash"] ??
      req.headers["verif_hash"] ??
      req.headers["x-flutterwave-signature"]
    ) as string | undefined;

    const result = await billingService.handleWebhook(
      req.body as Record<string, unknown>,
      signature,
    );
    res.status(200).json(result);
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    console.error("[Flutterwave-Webhook-Error]", e.message, "Payload:", JSON.stringify(req.body, null, 2));
    // Always respond 200 to prevent Flutterwave from retrying indefinitely on auth errors
    if (e.statusCode === 401) {
      res.status(401).json({ error: e.message });
      return;
    }
    next(err);
  }
};

export const getGroupBillingController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await billingService.getGroupBilling(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/billing/verify
// Body: { txRef: string }
// Called by the frontend after Flutterwave redirects back.
// Verifies the payment directly with Flutterwave API — idempotent (safe to call multiple times).
export const verifyPaymentController = async (
  req: Request<Record<string, never>, unknown, { txRef?: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const txRef = req.body?.txRef;
    if (!txRef || typeof txRef !== "string") {
      res.status(400).json({ error: "txRef is required" });
      return;
    }
    const result = await billingService.verifyPaymentByTxRef(txRef, req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
