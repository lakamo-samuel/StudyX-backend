import { Router } from "express";
import {
  getUploadSignatureController,
  saveFileController,
  getFilesByGroupController,
  getAllUserFilesController,
  updateFileController,
  deleteFileController,
  regenerateSummaryController,
} from "./toolkit.controller";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import { saveFileSchema, updateFileSchema } from "./toolkit.schema";

const router = Router();

router.use(authenticate);

router.get("/", getAllUserFilesController);
router.get("/group/:groupId", getFilesByGroupController);
router.get("/group/:groupId/signature", getUploadSignatureController);
router.post("/files", validate(saveFileSchema), saveFileController);
router.patch(
  "/files/:fileId",
  validate(updateFileSchema),
  updateFileController,
);
router.delete("/files/:fileId", deleteFileController);
router.post("/files/:fileId/regenerate-summary", regenerateSummaryController);

export default router;
