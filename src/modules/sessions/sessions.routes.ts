import { Router } from "express";
import {
  createSessionController,
  getSessionsByGroupController,
  getAllUserSessionsController,
  getSessionController,
  updateSessionController,
  updateSessionStatusController,
  deleteSessionController,
  addAgendaItemController,
  updateAgendaItemController,
  deleteAgendaItemController,
} from "./sessions.controller";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createSessionSchema,
  updateSessionSchema,
  updateSessionStatusSchema,
  createAgendaItemSchema,
  updateAgendaItemSchema,
} from "./sessions.schema";
import {  Request, Response, NextFunction } from "express";
import { sessions as sessionsTable } from "../../db/schema/sessions";
import { db } from "../../config/db";
import { eq } from "drizzle-orm";
import { aiQueue } from "../../jobs/queue";
import { generateContent } from "../../lib/gemini";
const router = Router();

router.use(authenticate);

router.get("/", getAllUserSessionsController);
router.post("/", validate(createSessionSchema), createSessionController);
router.get("/group/:groupId", getSessionsByGroupController);
router.get("/:sessionId", getSessionController);
router.patch(
  "/:sessionId",
  validate(updateSessionSchema),
  updateSessionController,
);
router.patch(
  "/:sessionId/status",
  validate(updateSessionStatusSchema),
  updateSessionStatusController,
);
router.delete("/:sessionId", deleteSessionController);
router.post(
  "/:sessionId/agenda",
  validate(createAgendaItemSchema),
  addAgendaItemController,
);
router.patch(
  "/agenda/:itemId",
  validate(updateAgendaItemSchema),
  updateAgendaItemController,
);
router.delete("/agenda/:itemId", deleteAgendaItemController);


router.post(
  "/:sessionId/generate-quiz",
  authenticate,
  async (
    req: Request<{ sessionId: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { fileIds = [], topic, questionCount = 5 } = req.body;
      const sessionId = req.params.sessionId;

      const session = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.id, sessionId))
        .limit(1);

      if (!session[0]) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      await aiQueue.add("generate-quiz", {
        sessionId,
        groupId: session[0].groupId,
        fileIds,
        topic,
        questionCount,
      });

      res.status(200).json({ message: "Quiz generation started" });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:sessionId/generate-agenda",
  authenticate,
  async (
    req: Request<{ sessionId: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { duration = 90 } = req.body;
      const sessionId = req.params.sessionId;

      const session = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.id, sessionId))
        .limit(1);

      if (!session[0]) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      await aiQueue.add("generate-agenda", {
        sessionId,
        groupId: session[0].groupId,
        duration,
      });

      res.status(200).json({ message: "Agenda generation started" });
    } catch (err) {
      next(err);
    }
  },
);
// ── AI CHAT ──
router.post(
  "/:sessionId/ai-chat",
  async (
    req: Request<{ sessionId: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { message, history = [] } = req.body;
      if (!message?.trim()) {
        res.status(400).json({ message: "message is required" });
        return;
      }

      const historyText = (history as { role: string; content: string }[])
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`)
        .join('\n');

      const prompt = `You are a helpful academic study assistant inside a platform called Vyrd.
Help students understand material, explain concepts, and support their learning.
Be concise, clear, and encouraging.

${historyText ? `Conversation so far:\n${historyText}\n` : ''}Student: ${message}
AI:`;

      const answer = await generateContent(prompt);
      res.status(200).json({ answer: answer.trim() });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
