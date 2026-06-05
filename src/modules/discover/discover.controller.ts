import { Request, Response, NextFunction } from "express";
import * as discoverService from "./discover.service";

export const searchGroupsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = req.query.q as string | undefined;
    const filter = req.query.filter as string | undefined;

    const result = await discoverService.searchGroups(
      req.user!.userId,
      query,
      filter,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getPublicGroupController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await discoverService.getPublicGroup(req.params.groupId);

    if (!result) {
      res.status(404).json({ message: "Group not found" });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const joinPublicGroupController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await discoverService.joinPublicGroup(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
