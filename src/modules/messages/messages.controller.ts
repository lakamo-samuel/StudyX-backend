import { Request, Response, NextFunction } from "express";
import * as messagesService from "./messages.service";

export const getMessagesController = async (
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await messagesService.getMessages(
      req.params.sessionId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const saveMessageController = async (
  req: Request<{ sessionId: string }, {}, { text: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await messagesService.saveMessage(
      req.params.sessionId,
      req.user!.userId,
      req.body.text,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};
