import { db } from "../../config/db";
import { files } from "../../db/schema/toolkit";
import { eq } from "drizzle-orm";
import { generateContent } from "../../lib/gemini";

export const handleAiSummarize = async (job: {
  data: { fileId: string; fileUrl: string; fileName: string };
}) => {
  const { fileId, fileUrl, fileName } = job.data;

  console.log(`🤖 Generating summary for file: ${fileName}`);

  try {
    const prompt = `
      You are an academic study assistant. 
      A student has uploaded a study file called "${fileName}".
      Based on the file name and context, generate a concise academic summary that:
      1. Explains the likely key topics covered
      2. Lists 3-5 main concepts a student should focus on
      3. Suggests 2-3 study questions based on the material
      
      Keep it concise — maximum 200 words.
      Format as plain text, no markdown.
    `;

    const summary = await generateContent(prompt);

    await db
      .update(files)
      .set({ hasAiSummary: true, summary })
      .where(eq(files.id, fileId));

    console.log(`✅ Summary saved for file: ${fileName}`);

    return { fileId, summary };
  } catch (err) {
    console.error(`❌ Failed to summarize file ${fileName}:`, err);
    throw err;
  }
};
