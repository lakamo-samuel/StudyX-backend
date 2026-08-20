import { Router } from "express";
import {
  registerController,
  verifyOtpController,
  resendOtpController,
  loginController,
  forgotPasswordController,
  resetPasswordController,
} from "./auth.controller";
import { validate } from "../../middleware/validate.middleware";
import { authRateLimit } from "../../middleware/rateLimit.middleware";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schema";

const router = Router();

router.post(
  "/register",
  authRateLimit,
  validate(registerSchema),
  registerController,
);
router.post(
  "/verify-otp",
  authRateLimit,
  validate(verifyOtpSchema),
  verifyOtpController,
);
router.post(
  "/resend-otp",
  authRateLimit,
  validate(resendOtpSchema),
  resendOtpController,
);
router.post("/login", authRateLimit, validate(loginSchema), loginController);
router.post(
  "/forgot-password",
  authRateLimit,
  validate(forgotPasswordSchema),
  forgotPasswordController,
);
router.post(
  "/reset-password",
  authRateLimit,
  validate(resetPasswordSchema),
  resetPasswordController,
);

export default router;
