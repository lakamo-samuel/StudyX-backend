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
  acceptInviteController,
  declineInviteController,
} from "./groups.controller";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  changeMemberRoleSchema,
} from "./groups.schema";

const router = Router();

router.use(authenticate);

router.get("/", getUserGroupsController);
router.post("/", validate(createGroupSchema), createGroupController);
router.get("/:groupId", getGroupController);
router.patch("/:groupId", validate(updateGroupSchema), updateGroupController);
router.delete("/:groupId", deleteGroupController);
router.post(
  "/:groupId/invite",
  validate(inviteMemberSchema),
  inviteMemberController,
);
router.delete("/:groupId/members/:memberId", removeMemberController);
router.patch(
  "/:groupId/members/:memberId/role",
  validate(changeMemberRoleSchema),
  changeMemberRoleController,
);
router.post("/:groupId/leave", leaveGroupController);
router.get("/:groupId/join-requests", getJoinRequestsController);
router.post("/:groupId/join-requests/:requesterId/approve", approveJoinRequestController);
router.post("/:groupId/join-requests/:requesterId/reject", rejectJoinRequestController);
router.post("/:groupId/invites/accept", acceptInviteController);
router.post("/:groupId/invites/decline", declineInviteController);

export default router;
