import { db } from "../../config/db";
import { files } from "../../db/schema/toolkit";
import { eq } from "drizzle-orm";
import { generateContent, generateFromFileUrl, getMimeType } from "../../lib/gemini";
import { getIo } from "../../socket/socket-instance";

/**
 * Extract Cloudinary public_id from a delivery URL.
 * URL format: https://res.cloudinary.com/<cloud>/image/upload/v<ts>/<public_id>.<ext>
 */
function extractPublicId(url: string): string | null {
  try {
    const afterUpload = url.split("/upload/")[1];
    if (!afterUpload) return null;
    return afterUpload.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

export const handleAiSummarize = async (job: {
  data: { fileId: string; fileUrl: string; fileName: string; fileType?: string };
}) => {
  const { fileId, fileUrl, fileName, fileType = "other" } = job.data;

  console.log(`🤖 Generating summary for: ${fileName}`);

  try {
    // Rich prompt using file name + type as context
    const contextPrompt = `
      You are an academic study assistant.
      A student uploaded a study file named "${fileName}" (type: ${fileType}).
      
      Based on the file name and type, generate a highly relevant academic summary:
      1. What topics this material likely covers (be specific to the subject area)
      2. 4-5 key concepts a student should master from this material
      3. 3 study questions to test understanding
      4. A brief study tip for this type of material
      
      Maximum 250 words. Use plain text, no markdown or bullet symbols.
      Be specific — not generic. Reference the actual subject matter from the filename.
    `;

    let summary: string;
    const mimeType = getMimeType(fileType, fileName);
    const canReadDirectly = ["pdf", "image", "txt"].includes(fileType);

    if (canReadDirectly && fileUrl) {
      try {
        // Attempt multimodal (works when Cloudinary delivery is set to public)
        summary = await generateFromFileUrl(contextPrompt, fileUrl, mimeType);
        console.log(`🔬 Multimodal summary generated for: ${fileName}`);
      } catch (fetchErr: any) {
        // Fallback: Cloudinary delivery requires authentication or file is inaccessible
        // NOTE: To enable multimodal, set your Cloudinary account delivery to "Public" in
        // Dashboard → Settings → Security → Access Control.
        console.warn(
          `⚠️  Multimodal unavailable for "${fileName}" (${fetchErr.message.split("\n")[0]}). Using context summary.`
        );
        summary = await generateContent(contextPrompt);
      }
    } else {
      summary = await generateContent(contextPrompt);
    }

    await db
      .update(files)
      .set({ hasAiSummary: true, summary })
      .where(eq(files.id, fileId));

    console.log(`✅ Summary saved for: ${fileName}`);

    // Push real-time update to any connected clients in the group
    const io = getIo();
    if (io) {
      // Emit to the group room so all members' file cards update instantly
      const [updatedFile] = await db
        .select({ groupId: files.groupId })
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

      if (updatedFile) {
        console.log(`📡 Emitting file:summary-ready to room ${updatedFile.groupId}`);
        io.to(updatedFile.groupId).emit("file:summary-ready", { fileId, summary });
      }
    }

    return { fileId, summary };
  } catch (err) {
    console.error(`❌ Failed to summarize "${fileName}":`, err);
    throw err;
  }
};
