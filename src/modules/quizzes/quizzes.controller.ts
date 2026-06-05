import { Request, Response, NextFunction } from "express";
import * as quizzesService from "./quizzes.service";
import type { CreateQuizInput, SubmitAnswerInput } from "./quizzes.schema";

export const createQuizController = async (
  req: Request<{}, {}, CreateQuizInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await quizzesService.createQuiz(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getQuizBySessionController = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await quizzesService.getQuizBySession(
      req.params.sessionId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const submitAnswerController = async (
  req: Request<{ quizId: string }, {}, SubmitAnswerInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await quizzesService.submitAnswer(
      req.params.quizId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getQuizResultsController = async (
  req: Request<{ quizId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await quizzesService.getQuizResults(
      req.params.quizId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getSessionDebriefController = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await quizzesService.getSessionDebrief(
      req.params.sessionId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
