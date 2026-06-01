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

export default router;
