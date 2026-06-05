import { Router } from "express";
import {
  searchGroupsController,
  getPublicGroupController,
  joinPublicGroupController,
} from "./discover.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", searchGroupsController);
router.get("/:groupId", getPublicGroupController);
router.post("/:groupId/join", joinPublicGroupController);

export default router;
