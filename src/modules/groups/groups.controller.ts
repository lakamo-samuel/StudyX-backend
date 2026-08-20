import { Request, Response, NextFunction } from "express";
import * as groupsService from "./groups.service";
import type {
  CreateGroupInput,
  UpdateGroupInput,
  InviteMemberInput,
  ChangeMemberRoleInput,
} from "./groups.schema";

export const createGroupController = async (
  req: Request<{}, {}, CreateGroupInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.createGroup(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getUserGroupsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.getUserGroups(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getGroupController = async (
  req: Request<{groupId: string}>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.getGroup(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const updateGroupController = async (
  req: Request<{ groupId: string }, UpdateGroupInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.updateGroup(
      req.params.groupId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const inviteMemberController = async (
  req: Request<{ groupId: string }, {}, InviteMemberInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.inviteMember(
      req.params.groupId,
      req.user!.userId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const removeMemberController = async (
  req: Request<{ groupId: string; memberId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.removeMember(
      req.params.groupId,
      req.user!.userId,
      req.params.memberId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const changeMemberRoleController = async (
  req: Request<
    { groupId: string; memberId: string },
    {},
    ChangeMemberRoleInput
  >,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.changeMemberRole(
      req.params.groupId,
      req.user!.userId,
      req.params.memberId,
      req.body,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const leaveGroupController = async (
  req: Request<{groupId: string}>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.leaveGroup(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteGroupController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.deleteGroup(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const acceptInviteController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.acceptInvite(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const declineInviteController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.declineInvite(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getJoinRequestsController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.getJoinRequests(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const approveJoinRequestController = async (
  req: Request<{ groupId: string; requesterId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.approveJoinRequest(
      req.params.groupId,
      req.user!.userId,
      req.params.requesterId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const rejectJoinRequestController = async (
  req: Request<{ groupId: string; requesterId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.rejectJoinRequest(
      req.params.groupId,
      req.user!.userId,
      req.params.requesterId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getScheduleSuggestionsController = async (
  req: Request<{ groupId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await groupsService.getScheduleSuggestions(
      req.params.groupId,
      req.user!.userId,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
