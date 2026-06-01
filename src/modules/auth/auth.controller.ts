import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyOtpInput,
} from "./auth.schema";

export const registerController = async (
  req: Request<{}, {}, RegisterInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const verifyOtpController = async (
  req: Request<{}, {}, VerifyOtpInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.verifyOtp(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const loginController = async (
  req: Request<{}, {}, LoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const forgotPasswordController = async (
  req: Request<{}, {}, ForgotPasswordInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.forgotPassword(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const resetPasswordController = async (
  req: Request<{}, {}, ResetPasswordInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
