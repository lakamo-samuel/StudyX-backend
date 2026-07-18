import axios from "axios";
import { db } from "../../config/db";
import { files } from "../../db/schema/toolkit";
import { eq } from "drizzle-orm";
import {
  generateChatContent,
  getMimeType,
} from "../../lib/gemini";
import { buildGroupContext } from "../../lib/ai-context";
import { getIo } from "../../socket/socket-instance";
import cloudinary from "../../config/cloudinary";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";
import type { Part } from "@google/generative-ai";

// ── DOCX extraction via mammoth ──
async function extractDocxText(buffer: Buffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || null;
  } catch {
    return null;
  }
}

// ── Download file from Cloudinary using backend credentials ──
// This works regardless of delivery type (public/authenticated/private)
// by using Cloudinary's private_download_url which signs with API secret.
async function downloadFromCloudinary(
  fileUrl: string,
): Promise<Buffer | null> {
  try {
    // Strategy 1: Direct fetch (works if Cloudinary delivery is public)
    const response = await axios.get<ArrayBuffer>(fileUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    return Buffer.from(response.data);
  } catch (directErr: any) {
    const status = directErr.response?.status;
    if (status !== 401 && status !== 403) {
      // Network error, not auth — don't retry
      console.warn(`⚠️  File fetch failed (${status ?? "network"}): ${fileUrl}`);
      return null;
    }

    // Strategy 2: Generate a signed download URL using Cloudinary credentials
    try {
      console.log("🔑 Direct fetch failed, attempting signed URL download...");
      const publicId = extractPublicId(fileUrl);
      if (!publicId) return null;

      // Determine resource type from URL path
      const resourceType = fileUrl.includes("/raw/") ? "raw" : "image";

      const signedUrl = cloudinary.url(publicId, {
        sign_url: true,
        secure: true,
        type: "upload",
        resource_type: resourceType,
      });

      const signedResponse = await axios.get<ArrayBuffer>(signedUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      console.log(`✅ Signed URL download succeeded for publicId: ${publicId}`);
      return Buffer.from(signedResponse.data);
    } catch (signedErr: any) {
      console.warn(
        `⚠️  Signed URL download also failed: ${signedErr.message?.split("\n")[0]}`,
      );
      return null;
    }
  }
}

// Extract Cloudinary public_id from a CDN URL
function extractPublicId(url: string): string | null {
  try {
    // CDN URL format:
    // https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{folder}/{id}.{ext}
    // https://res.cloudinary.com/{cloud}/raw/upload/v{ver}/{folder}/{id}.{ext}
    const match = url.match(
      /\/(?:image|raw|video)\/(?:upload|authenticated)\/(?:v\d+\/)?(.+?)(?:\.[^/.]+)?$/,
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Build the rich 500-600 word summary prompt ──
function buildSummaryPrompt(
  fileName: string,
  fileType: string,
  groupContext: string,
  extractedText?: string,
): string {
  const contentSection = extractedText
    ? `Document content (read carefully before writing):\n${extractedText}`
    : `File name: "${fileName}" (type: ${fileType.toUpperCase()})`;

  const instruction = extractedText
    ? "Write a precise, comprehensive study summary based ONLY on the document content provided above."
    : `Based on the file name and subject area, write an estimated study summary.
Note at the start: "Note: This is an estimated summary based on the file name. Upload the file again if you need an accurate analysis."`;

  return `
You are an expert academic tutor helping university students understand their study materials.

${groupContext ? `Study group context:\n${groupContext}\n` : ""}
${contentSection}

${instruction}

Structure your response EXACTLY as follows (use these exact section headers):

OVERVIEW
Write 3-4 sentences explaining what this document covers, the specific subject area, and its academic significance.

KEY CONCEPTS
List exactly 6 of the most important concepts, theories, or frameworks. For each:
- Name the concept clearly
- Give a 2-sentence explanation specific to this material
Be specific — use actual terminology from the document, not generic descriptions.

CRITICAL DETAILS
List 5-6 specific facts, formulas, definitions, dates, or processes that are commonly examined.
Be precise — extract actual content from the document, not generalities.

EXAM QUESTIONS
Write 4 exam-style questions that test deep understanding of this material.
Make them specific to the content (not generic "what is X" questions).

STUDY STRATEGY
Give one concrete, subject-specific tip for mastering this material.

Target length: 500-600 words. Be specific and academic throughout.
Do NOT use markdown bold (**) or hash symbols (#). Use plain text with the section headers above.
Do NOT write generic descriptions. Every sentence must reference actual content.
`.trim();
}

// ── GEMINI MULTIMODAL — inline file data ──
async function generateFromBuffer(
  prompt: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 3000, temperature: 0.4 },
  });

  const parts: Part[] = [
    { text: prompt },
    { inlineData: { mimeType, data: buffer.toString("base64") } },
  ];

  const result = await model.generateContent(parts);
  return result.response.text();
}

export const handleAiSummarize = async (job: {
  data: {
    fileId: string;
    fileUrl: string;
    fileName: string;
    fileType?: string;
  };
}) => {
  const { fileId, fileUrl, fileName, fileType = "other" } = job.data;

  console.log(`🤖 Generating summary for: "${fileName}" (${fileType})`);

  try {
    // Fetch group context for personalisation
    const [fileRecord] = await db
      .select({ groupId: files.groupId })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    const groupCtx = fileRecord
      ? await buildGroupContext(fileRecord.groupId)
      : null;
    const groupContext = groupCtx?.contextString ?? "";

    let summary: string;
    let summarySource: "multimodal" | "docx-extracted" | "text-extracted" | "context-only" =
      "context-only";

    if (fileUrl) {
      const buffer = await downloadFromCloudinary(fileUrl);

      if (buffer && buffer.length > 100) {
        // ── DOCX: extract text via mammoth, then text-only prompt ──
        if (fileType === "docx") {
          const docxText = await extractDocxText(buffer);
          if (docxText && docxText.length > 50) {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext, docxText);
            summary = await generateChatContent(prompt);
            summarySource = "docx-extracted";
            console.log(`📄 DOCX extracted: ${docxText.length} chars`);
          } else {
            // DOCX extraction failed → fall through to context-only
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateChatContent(prompt);
          }
        }
        // ── TXT: decode as text, inject directly ──
        else if (fileType === "txt") {
          const textContent = buffer.toString("utf-8").trim();
          if (textContent.length > 50) {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext, textContent);
            summary = await generateChatContent(prompt);
            summarySource = "text-extracted";
            console.log(`📃 TXT content: ${textContent.length} chars`);
          } else {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateChatContent(prompt);
          }
        }
        // ── PDF / image: multimodal inline data ──
        else if (fileType === "pdf" || fileType === "image") {
          const mimeType = getMimeType(fileType, fileName);
          try {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateFromBuffer(prompt, buffer, mimeType);
            summarySource = "multimodal";
            console.log(`🔬 Multimodal generated for: "${fileName}" (${buffer.length} bytes)`);
          } catch (multimodalErr: any) {
            console.warn(
              `⚠️  Multimodal failed for "${fileName}": ${multimodalErr.message?.split("\n")[0]}. Falling back to context-only.`,
            );
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateChatContent(prompt);
          }
        } else {
          // Unknown type but we have the buffer — try text decode
          const textContent = buffer.toString("utf-8").trim();
          if (textContent.length > 50 && !textContent.includes("\x00")) {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext, textContent);
            summary = await generateChatContent(prompt);
            summarySource = "text-extracted";
          } else {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateChatContent(prompt);
          }
        }
      } else {
        // File download failed entirely
        console.warn(`⚠️  Could not download file "${fileName}" — using context-only summary`);
        const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
        summary = await generateChatContent(prompt);
      }
    } else {
      // No URL at all
      const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
      summary = await generateChatContent(prompt);
    }

    // Only prepend disclaimer for context-only summaries
    const finalSummary =
      summarySource === "context-only"
        ? `[Estimated summary — file could not be read directly. Re-upload the file for a more accurate analysis]\n\n${summary}`
        : summary;

    await db
      .update(files)
      .set({ hasAiSummary: true, summary: finalSummary })
      .where(eq(files.id, fileId));

    console.log(`✅ Summary saved for "${fileName}" (source: ${summarySource})`);

    // Real-time push to group room
    const io = getIo();
    if (io && fileRecord) {
      io.to(fileRecord.groupId).emit("file:summary-ready", {
        fileId,
        summary: finalSummary,
        summarySource,
      });
    }

    return { fileId, summarySource };
  } catch (err) {
    console.error(`❌ Failed to summarize "${fileName}":`, err);
    throw err;
  }
};
