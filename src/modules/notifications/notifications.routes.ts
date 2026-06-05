import { Router } from "express";
import {
  getUserNotificationsController,
  markAsReadController,
  markAllAsReadController,
  deleteNotificationController,
} from "./notifications.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", getUserNotificationsController);
router.patch("/read-all", markAllAsReadController);
router.patch("/:notificationId/read", markAsReadController);
router.delete("/:notificationId", deleteNotificationController);

export default router;
