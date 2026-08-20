import { Router } from "express";
import {
  createGroupController,
  getUserGroupsController,
  getGroupController,
  updateGroupController,
  inviteMemberController,
  removeMemberController,
  changeMemberRoleController,
  leaveGroupController,
  deleteGroupController,
  getJoinRequestsController,
  approveJoinRequestController,
  rejectJoinRequestController,
  getScheduleSuggestionsController,
  acceptInviteController,
  declineInviteController,
} from "./groups.controller";
import {
  createInviteLinkController,
  getInviteLinksController,
  revokeInviteLinkController,
  getInviteLinkPreviewController,
  acceptInviteLinkController,
} from "./invite-link.controller";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  changeMemberRoleSchema,
} from "./groups.schema";

const router = Router();

// ── Public: invite link preview (no auth needed to see the group name) ────────
router.get("/join/:token/preview", getInviteLinkPreviewController);

// ── All routes below require authentication ───────────────────────────────────
router.use(authenticate);

// ── Group CRUD ────────────────────────────────────────────────────────────────
router.get("/",         getUserGroupsController);
router.post("/",        validate(createGroupSchema), createGroupController);
router.get("/:groupId", getGroupController);
router.patch("/:groupId", validate(updateGroupSchema), updateGroupController);
router.delete("/:groupId", deleteGroupController);

// ── Email invites ─────────────────────────────────────────────────────────────
router.post("/:groupId/invite",         validate(inviteMemberSchema), inviteMemberController);
router.post("/:groupId/invites/accept",  acceptInviteController);
router.post("/:groupId/invites/decline", declineInviteController);

// ── Shareable invite links ────────────────────────────────────────────────────
router.post("/:groupId/invite-links",              createInviteLinkController);
router.get("/:groupId/invite-links",               getInviteLinksController);
router.delete("/:groupId/invite-links/:linkId",    revokeInviteLinkController);
router.post("/join/:token/accept",                 acceptInviteLinkController);

// ── Members ───────────────────────────────────────────────────────────────────
router.delete("/:groupId/members/:memberId",       removeMemberController);
router.patch("/:groupId/members/:memberId/role",   validate(changeMemberRoleSchema), changeMemberRoleController);
router.post("/:groupId/leave",                     leaveGroupController);

// ── Join requests ─────────────────────────────────────────────────────────────
router.get("/:groupId/join-requests",                       getJoinRequestsController);
router.post("/:groupId/join-requests/:requesterId/approve", approveJoinRequestController);
router.post("/:groupId/join-requests/:requesterId/reject",  rejectJoinRequestController);

// ── Schedule suggestions ──────────────────────────────────────────────────────
router.get("/:groupId/schedule-suggestions", getScheduleSuggestionsController);

export default router;
