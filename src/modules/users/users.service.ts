import { eq } from "drizzle-orm"
import { db } from "../../config/db"
import { users } from "../../db/schema/users"
import { AppError } from "../../middleware/error.middleware"
import { ChangePasswordInput, UpdateProfileInput } from "../user.schema"
import bcrypt from "bcryptjs";
import constants from "constants"
import { env } from "../../config/env"

// ── GET PROFILE ──
export const getProfile = async (userId: string) => {
    const [user] = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            university: users.university,
            course: users.course,
            year: users.year,
            avatar: users.avatar,
            streak: users.streak,
            createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if(!user) throw new AppError('User not found', 404)
 
    return  user
}



// ── UPDATE PROFILE ──
export const updateProfile = async (userId: string, input: UpdateProfileInput) => {
  const [updated] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({
      id:         users.id,
      name:       users.name,
      email:      users.email,
      university: users.university,
      course:     users.course,
      year:       users.year,
      avatar:     users.avatar,
      streak:     users.streak,
    })

  if (!updated) throw new AppError('User not found', 404)

  return updated
}

// ── CHANGE PASSWORD ──
export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new AppError('User not found', 404)

  const isMatch = await bcrypt.compare(input.currentPassword, user.password)

  if (!isMatch) throw new AppError('Current password is incorrect', 400)

  const hashed = await bcrypt.hash(input.newPassword, 12)

  await db
    .update(users)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(users.id, userId))

  return { message: 'Password changed successfully' }
}

export const getAvatarUploadSignature = async () => {
    const cloudinary = (await import('../../config/cloudinary')).default
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder: 'vyrd/avatars' },
        env.CLOUDINARY_API_SECRET  as string
    )


    return {
        timestamp,
        signature,
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        folder: 'vyrd/avatars',
    }
}

// ── DELETE ACCOUNT ──
export const deleteAccount = async (userId: string) => {
  await db.delete(users).where(eq(users.id, userId))
  return { message: 'Account deleted successfully' }
}