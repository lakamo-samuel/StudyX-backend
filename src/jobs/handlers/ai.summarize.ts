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
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";
import type { Part } from "@google/generative-ai";
import {
  downloadFromCloudinary,
  extractDocxText,
  extractPptxText,
} from "../../lib/file-utils";

// ── Build comprehensive, study-friendly summary prompt ──
function buildSummaryPrompt(
  fileName: string,
  fileType: string,
  groupContext: string,
  extractedText?: string,
): string {
  const contentSection = extractedText
    ? `Document content (read carefully, extract ALL important information):\n${extractedText}`
    : `File name: "${fileName}" (type: ${fileType.toUpperCase()})`;

  const instruction = extractedText
    ? "Create a COMPREHENSIVE, well-structured study guide based ONLY on the document content provided above."
    : `Based on the file name and subject area, create an estimated study guide.
Include disclaimer: "Note: This is an estimated summary based on the file name. Upload the file for a detailed analysis."`;

  return `
You are an expert university-level academic tutor creating comprehensive study guides for students.

${groupContext ? `Study group context:\n${groupContext}\n` : ""}
${contentSection}

${instruction}

CREATE AN EXHAUSTIVELY DETAILED STUDY GUIDE with the following structure. Use these EXACT section headers with no symbols (no ===):

OVERVIEW
Write 4-5 sentences explaining:
- What this document/module is about
- The specific subject area and discipline
- Why this material is academically important
- Learning objectives
Be detailed and specific.

KEY CONCEPTS & DEFINITIONS
List 8-10 essential concepts, terms, theories, or frameworks. For EACH one:
- Name the concept clearly
- Write 3-4 sentences explaining it with specific examples from the document
- Explain how it relates to other concepts
Be thorough — these are key terms for exam study.

TOPICS BY UNIT/SECTION
Break down the material by unit or major section. For each:
- Unit name/number
- 3-5 bullet points of key information
- Sub-topics if applicable
- Specific examples or case studies mentioned
Make this section detailed and well-organized for easy reference.

CRITICAL DETAILS & FACTS
List 8-10 specific facts, definitions, formulas, dates, percentages, processes, or step-by-step procedures.
Be precise — extract EXACT content from the document.
Format as numbered list for easy studying.

PRACTICAL EXAMPLES & CASE STUDIES
Highlight real-world examples, case studies, scenarios, or applications mentioned in the material.
Explain how each demonstrates the concepts.
This helps students connect theory to practice.

EXAM-STYLE QUESTIONS
Write 6 challenging questions that test deep understanding:
- 2 definition/concept questions
- 2 application/analysis questions
- 2 synthesis/comparison questions
Make them specific to the content, not generic.
Include model answers (2-3 sentences each).

COMMON PITFALLS & TRICKY CONCEPTS
List 3-4 areas where students often struggle or make mistakes.
Explain the correct understanding for each.

STUDY TIPS & MEMORY AIDS
Provide 2-3 concrete, subject-specific strategies for mastering this material.
Include mnemonics, analogies, or learning techniques if applicable.

RECOMMENDED NEXT STEPS
Suggest what students should review next or practice to solidify understanding.

IMPORTANT FORMATTING RULES:
- Use UPPERCASE section headers with a blank line before and after (no === symbols)
- Use bullet points (- ) and numbering (1. ) for readability
- Be comprehensive and detailed — assume the student is studying for an exam
- DO NOT use markdown formatting (**bold**, #headers, etc.)
- EVERY section must be substantial (3-10 sentences minimum)
- Extract ACTUAL content from the document, not generic descriptions
- Target length: 1200-1500 words (comprehensive, not brief)
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
    generationConfig: { maxOutputTokens: 5000, temperature: 0.3 },
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
    // Fetch group context and file record for notifications
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
    let summarySource: "multimodal" | "docx-extracted" | "pptx-extracted" | "text-extracted" | "context-only" =
      "context-only";
    let downloadError: string | null = null;

    if (fileUrl) {
      const { buffer, error } = await downloadFromCloudinary(fileUrl);
      downloadError = error || null;

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
            console.warn(`⚠️  Failed to extract text from DOCX "${fileName}"`);
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateChatContent(prompt);
          }
        }
        // ── PPTX: extract text via JSZip ──
        else if (fileType === "pptx") {
          const pptxText = await extractPptxText(buffer);
          if (pptxText && pptxText.length > 50) {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext, pptxText);
            summary = await generateChatContent(prompt);
            summarySource = "pptx-extracted";
            console.log(`📊 PPTX extracted: ${pptxText.length} chars`);
          } else {
            // PPTX extraction failed → fall through to context-only
            console.warn(`⚠️  Failed to extract text from PPTX "${fileName}"`);
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
            console.log(`📝 Unknown type decoded as text: ${textContent.length} chars`);
          } else {
            const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
            summary = await generateChatContent(prompt);
          }
        }
      } else {
        // File download failed entirely
        console.warn(
          `⚠️  Could not download file "${fileName}" — error: ${downloadError}`,
        );
        const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
        summary = await generateChatContent(prompt);
      }
    } else {
      // No URL at all
      const prompt = buildSummaryPrompt(fileName, fileType, groupContext);
      summary = await generateChatContent(prompt);
    }

    // Build final summary with appropriate disclaimer
    let finalSummary = summary;
    if (summarySource === "context-only" && downloadError) {
      // File couldn't be downloaded — be explicit
      finalSummary = `[⚠️ Could not read file directly: ${downloadError}. Summary based on filename only. Please verify accuracy.]\n\n${summary}`;
    } else if (summarySource === "context-only") {
      // No file URL provided
      finalSummary = `[ℹ️ Estimated summary based on file name. Upload the file again for detailed analysis.]\n\n${summary}`;
    }

    // Save to database
    await db
      .update(files)
      .set({ hasAiSummary: true, summary: finalSummary })
      .where(eq(files.id, fileId));

    console.log(`✅ Summary saved for "${fileName}" (source: ${summarySource})`);

    // Real-time push to client
    const io = getIo();
    if (io && fileRecord) {
      io.to(fileRecord.groupId).emit("file:summary-ready", {
        fileId,
        summary: finalSummary,
        summarySource,
        downloadError,
      });
    }

    return { fileId, summarySource, downloadError };
  } catch (err) {
    console.error(`❌ Failed to summarize "${fileName}":`, err);

    // Notify client of failure
    const [fileRecord] = await db
      .select({ groupId: files.groupId })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    const io = getIo();
    if (io && fileRecord) {
      io.to(fileRecord.groupId).emit("file:summary-error", {
        fileId,
        fileName,
        message: "Failed to generate summary. Please try again later.",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    throw err;
  }
};
