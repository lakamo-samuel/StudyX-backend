import { Request, Response, NextFunction } from "express";
import * as notificationsService from "./notifications.service";

export const getUserNotificationsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await notificationsService.getUserNotifications(
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const markAsReadController = async (
  req: Request<{ notificationId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await notificationsService.markAsRead(
      req.params.notificationId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const markAllAsReadController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await notificationsService.markAllAsRead(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteNotificationController = async (
  req: Request<{ notificationId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await notificationsService.deleteNotification(
      req.params.notificationId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
