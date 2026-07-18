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
  generateQuizController,
  generateAgendaController,
  aiChatController,
} from "./sessions.controller";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import { aiRateLimit } from "../../middleware/rateLimit.middleware";
import {
  createSessionSchema,
  updateSessionSchema,
  updateSessionStatusSchema,
  createAgendaItemSchema,
  updateAgendaItemSchema,
} from "./sessions.schema";

const router = Router();

// authenticate applies to every route in this router
router.use(authenticate);

// ── Sessions CRUD ──
router.get("/", getAllUserSessionsController);
router.post("/", validate(createSessionSchema), createSessionController);
router.get("/group/:groupId", getSessionsByGroupController);
router.get("/:sessionId", getSessionController);
router.patch("/:sessionId", validate(updateSessionSchema), updateSessionController);
router.patch("/:sessionId/status", validate(updateSessionStatusSchema), updateSessionStatusController);
router.delete("/:sessionId", deleteSessionController);

// ── Agenda ──
router.post("/:sessionId/agenda", validate(createAgendaItemSchema), addAgendaItemController);
router.patch("/agenda/:itemId", validate(updateAgendaItemSchema), updateAgendaItemController);
router.delete("/agenda/:itemId", deleteAgendaItemController);

// ── AI features — rate-limited to 5 req/min per user ──
router.post("/:sessionId/generate-quiz", aiRateLimit, generateQuizController);
router.post("/:sessionId/generate-agenda", aiRateLimit, generateAgendaController);
router.post("/:sessionId/ai-chat", aiRateLimit, aiChatController);


export default router;
