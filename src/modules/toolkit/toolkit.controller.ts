import { Request, Response, NextFunction } from "express";
import * as toolkitService from "./toolkit.service";
import type { SaveFileInput, UpdateFileInput } from "./toolkit.schema";

export const getUploadSignatureController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.getUploadSignature(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const saveFileController = async (
  req: Request<{}, {}, SaveFileInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.saveFile(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getFilesByGroupController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.getFilesByGroup(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getAllUserFilesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.getAllUserFiles(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateFileController = async (
  req: Request<{ fileId: string }, {}, UpdateFileInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.updateFile(
      req.params.fileId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteFileController = async (
  req: Request<{ fileId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.deleteFile(
      req.params.fileId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const regenerateSummaryController = async (
  req: Request<{ fileId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await toolkitService.regenerateSummary(
      req.params.fileId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
