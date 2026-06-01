import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { changePasswordController, deleteAccountController, getAvatarUploadSignatureController, getProfileController, updateProfileController } from "./users.controller";
import { validate } from "../../middleware/validate.middleware";
import { changePasswordSchema, updateProfileSchema } from "../user.schema";



const router = Router()

router.use(authenticate)

router.get('/me', getProfileController)
router.patch('/me', validate(updateProfileSchema), updateProfileController);
router.patch('/me/password', validate(changePasswordSchema), changePasswordController);
router.get('/me/avatar-signature', getAvatarUploadSignatureController)
router.delete('/me', deleteAccountController)


export default router