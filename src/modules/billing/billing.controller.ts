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
    // Flutterwave sends the secret in the verif-hash header
    const signature = req.headers["verif-hash"] as string | undefined;

    // Temporary: log the full payload so we can verify the structure
    console.log("[webhook] verif-hash:", signature);
    console.log("[webhook] body:", JSON.stringify(req.body, null, 2));

    const result = await billingService.handleWebhook(
      req.body as Record<string, unknown>,
      signature,
    );
    res.status(200).json(result);
  } catch (err) {
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
