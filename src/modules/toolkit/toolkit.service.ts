import { eq, and } from "drizzle-orm";
import { db } from "../../config/db";
import { files } from "../../db/schema/toolkit";
import { groupMembers } from "../../db/schema/groups";
import { AppError } from "../../middleware/error.middleware";
import cloudinary from "../../config/cloudinary";
import { env } from "../../config/env";
import type { SaveFileInput, UpdateFileInput } from "./toolkit.schema";
import { aiQueue } from "../../jobs/queue";


// ── helper: assert group member ──
const assertGroupMember = async (groupId: string, userId: string) => {
  const [member] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .limit(1);

  if (!member) throw new AppError("You are not a member of this group", 403);
  return member;
};


// -- GET UPLOAD SIGNATURE --
export const getUploadSignature = async (groupId: string, userId: string) => {
    await assertGroupMember(groupId, userId)

    const timestamp = Math.round(new Date().getTime() / 1000)
    const folder = `vyrd/group/${groupId}`

    const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder },
        env.CLOUDINARY_API_SECRET as string
    )

    return {
        timestamp,
        signature,
        folder,
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
    }
}

// -- SAVE FILE (after Cloudinary upload) --

export const saveFile = async (userId: string, input: SaveFileInput) => {
  await assertGroupMember(input.groupId, userId);

  const [file] = await db
    .insert(files)
    .values({
      groupId: input.groupId,
      uploadedBy: userId,
      name: input.name,
      url: input.url,
      type: input.type,
    })
    .returning();

  // trigger AI summary job in background
  await aiQueue.add("summarize-file", {
    fileId: file.id,
    fileUrl: file.url,
    fileName: file.name,
  });

  return file;
};
// -- GET FILES BY GROUP --

export const getFilesByGroup = async (groupId: string, userId: string) => {
  await assertGroupMember(groupId, userId);

  return db
    .select()
    .from(files)
    .where(eq(files.groupId, groupId))
    .orderBy(files.createdAt);
};

// -- GET ALL USER FILES (across all groups) --
export const getAllUserFiles = async (userId: string) => {
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return [];

  const allFiless = await Promise.all(
    groupIds.map((groupId) =>
      db.select().from(files).where(eq(files.groupId, groupId)),
    ),
  );

  return allFiless
    .flat()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
};

// --UPDATE FILE --

export const updateFile = async (
  fileId: string,
  userId: string,
  input: UpdateFileInput,
) => {
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file) throw new AppError("File not found", 404);

  await assertGroupMember(file.groupId, userId);

  const [updated] = await db
    .update(files)
    .set(input)
    .where(eq(files.id, userId))
    .returning();

  return updated;
};

// -- DELETE FILE --
export const deleteFile = async (fileId: string, userId: string) => {
    const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1)

    if (!file) throw new AppError('File not found', 404)
    
    await assertGroupMember(file.groupId, userId)

    // delete from cloudinary
    const publicId = file.url.split('/').slice(-1)[0].split('.')[0]
      try {
        await cloudinary.uploader.destroy(
          `vyrd/groups/${file.groupId}/${publicId}`,
        );
      } catch (err) {
        console.warn("⚠️ Cloudinary delete failed — removing from DB anyway");
      }
    
    await db.delete(files).where(eq(files.id, fileId))

    return {message: 'File deleted successfullly'}
}

// -- SAVE AI SUMMARY --
export const saveAiSummary = async (fileId: string, summary: string) => {
    const [updated] = await db.update(files).set({hasAiSummary: true, summary}).where(eq(files.id,fileId)).returning()

    return updated
}