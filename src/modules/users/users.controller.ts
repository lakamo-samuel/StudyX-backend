import { Request, Response, NextFunction } from "express";
import * as usersService from "./users.service";
import { ChangePasswordInput, UpdateProfileInput } from "../user.schema";

export const getProfileController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await usersService.getProfile(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateProfileController = async (
  req: Request<{}, {}, UpdateProfileInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await usersService.updateProfile(req.user!.userId, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const changePasswordController = async (
  req: Request<{}, {}, ChangePasswordInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await usersService.changePassword(
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getAvatarUploadSignatureController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await usersService.getAvatarUploadSignature();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await usersService.deleteAccount(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
