import { Router } from "express";
import {
  createQuizController,
  getQuizBySessionController,
  submitAnswerController,
  getQuizResultsController,
  getSessionDebriefController,
} from "./quizzes.controller";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import { createQuizSchema, submitAnswerSchema } from "./quizzes.schema";

const router = Router();

router.use(authenticate);

router.post("/", validate(createQuizSchema), createQuizController);
router.get("/session/:sessionId", getQuizBySessionController);
router.get("/session/:sessionId/debrief", getSessionDebriefController);
router.post(
  "/:quizId/answer",
  validate(submitAnswerSchema),
  submitAnswerController,
);
router.get("/:quizId/results", getQuizResultsController);

export default router;
