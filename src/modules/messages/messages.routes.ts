import { Router } from "express";
import {
  getMessagesController,
  saveMessageController,
} from "./messages.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { z } from "zod";

const messageSchema = z.object({
  text: z.string().min(1, "Message cannot be empty"),
});

const router = Router();

router.use(authenticate);

router.get("/:sessionId", getMessagesController);
router.post("/:sessionId", validate(messageSchema), saveMessageController);

export default router;
