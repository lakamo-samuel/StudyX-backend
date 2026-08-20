import { NextFunction, Request, Response } from "express";
import * as inviteLinkService from "./invite-link.service";

export const createInviteLinkController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { maxUses, expiresInDays } = req.body as {
      maxUses?: number | null;
      expiresInDays?: number | null;
    };
    const result = await inviteLinkService.createInviteLink(
      req.params.groupId,
      req.user!.userId,
      { maxUses, expiresInDays },
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getInviteLinksController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await inviteLinkService.getInviteLinks(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const revokeInviteLinkController = async (
  req: Request<{ groupId: string; linkId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await inviteLinkService.revokeInviteLink(
      req.params.groupId,
      req.params.linkId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getInviteLinkPreviewController = async (
  req: Request<{ token: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await inviteLinkService.getInviteLinkPreview(req.params.token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const acceptInviteLinkController = async (
  req: Request<{ token: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await inviteLinkService.acceptInviteLink(
      req.params.token,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
