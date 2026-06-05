import { Request, Response, NextFunction } from "express";
import * as sessionsService from "./sessions.service";
import type {
  CreateSessionInput,
  UpdateSessionInput,
  UpdateSessionStatusInput,
  CreateAgendaItemInput,
  UpdateAgendaItemInput,
} from "./sessions.schema";

export const createSessionController = async (
  req: Request<{}, {}, CreateSessionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.createSession(
      req.user!.userId,
      req.body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getSessionsByGroupController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.getSessionsByGroup(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getAllUserSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.getAllUserSessions(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getSessionController = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.getSession(
      req.params.sessionId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateSessionController = async (
  req: Request<{ sessionId: string }, {}, UpdateSessionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.updateSession(
      req.params.sessionId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateSessionStatusController = async (
  req: Request<{ sessionId: string }, {}, UpdateSessionStatusInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.updateSessionStatus(
      req.params.sessionId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteSessionController = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.deleteSession(
      req.params.sessionId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const addAgendaItemController = async (
  req: Request<{ sessionId: string }, {}, CreateAgendaItemInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.addAgendaItem(
      req.params.sessionId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateAgendaItemController = async (
  req: Request<{ itemId: string }, {}, UpdateAgendaItemInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.updateAgendaItem(
      req.params.itemId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteAgendaItemController = async (
  req: Request<{ itemId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await sessionsService.deleteAgendaItem(
      req.params.itemId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
