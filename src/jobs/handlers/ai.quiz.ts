import { z } from "zod";
import { db } from "../../config/db";
import { quizzes, quizQuestions } from "../../db/schema/quizzes";
import { sessions } from "../../db/schema/sessions";
import { eq } from "drizzle-orm";
import { generateJson, generateJsonFromParts } from "../../lib/gemini";
import { buildGroupContext, buildToolkitRawContent } from "../../lib/ai-context";
import { getIo } from "../../socket/socket-instance";
import type { Part } from "@google/generative-ai";

// ────────────────────────────────────────────────────────
//  ZOD SCHEMA — validates every question Gemini returns
// ────────────────────────────────────────────────────────
const QuizQuestionSchema = z
  .object({
    question: z.string().min(5).max(600),
    options: z.array(z.string().min(1).max(300)).length(4),
    correctAnswer: z.string().min(1).max(300),
    order: z.number().int().min(0),
  })
  .refine((q) => q.options.includes(q.correctAnswer), {
    message: "correctAnswer must exactly match one of the options",
  });

const QuizArraySchema = z.array(QuizQuestionSchema).min(1).max(20);

// ────────────────────────────────────────────────────────
//  QUIZ GENERATION JOB
// ────────────────────────────────────────────────────────
export const handleAiQuiz = async (job: {
  data: {
    sessionId: string;
    groupId: string;
    fileIds: string[];
    topic?: string;
    questionCount?: number;
  };
}) => {
  const { sessionId, groupId, fileIds, topic, questionCount = 5 } = job.data;

  console.log(`🤖 Generating quiz for session: ${sessionId}`);

  try {
    // ── Fetch session details ──
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    // ── Load actual file content (PDFs/images inline, DOCX/TXT extracted) ──
    const [groupCtx, rawContent] = await Promise.all([
      buildGroupContext(groupId),
      buildToolkitRawContent(groupId, fileIds.length > 0 ? fileIds : undefined),
    ]);

    const sessionInfo = session
      ? `Session title: "${session.title}"\nSession goal: "${session.goal ?? "Study effectively"}"`
      : "";

    const topicLine = topic ? `Focus topic: "${topic}"` : "";

    const textMaterialsSection =
      rawContent.textBlocks.length > 0
        ? `Study materials (read carefully before generating questions):\n\n${rawContent.textBlocks.join("\n\n")}`
        : "";

    const noMaterialsNote =
      !rawContent.hasMaterial
        ? "No study materials uploaded — generate questions based on the session topic and goal."
        : "";

    const promptText = `
You are generating a multiple-choice quiz for a university group study session.

${groupCtx.contextString}
${sessionInfo}
${topicLine}

${textMaterialsSection}
${noMaterialsNote}
${rawContent.parts.length > 0 ? "The study materials are attached as files. Read them carefully before generating questions." : ""}

Generate exactly ${questionCount} multiple-choice questions STRICTLY based on the materials and context above.
Do NOT invent facts not supported by the materials or session goal.
Every question must be directly answerable from the information provided.

Requirements per question:
- Exactly 4 options written as complete phrases (not just "A", "B", etc.)
- correctAnswer must be the full text of one option (copy it exactly)
- Mix of difficulty: 40% recall, 40% comprehension, 20% application
- No trick questions or ambiguous phrasing
- order is the question index starting from 0

Return ONLY a JSON array — no explanation, no markdown fences, no extra text:
[
  {
    "question": "Question text here?",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctAnswer": "Option A text",
    "order": 0
  }
]

You MUST return exactly ${questionCount} questions.
    `.trim();

    // ── Choose call strategy: multimodal (PDF/image parts) vs text-only ──
    let raw: string;
    if (rawContent.parts.length > 0) {
      // Build parts array: prompt text → text material blocks → inline file data
      const allParts: Part[] = [
        { text: promptText } as Part,
        ...(rawContent.textBlocks.length > 0
          ? [{ text: rawContent.textBlocks.join("\n\n") } as Part]
          : []),
        ...rawContent.parts,
      ];
      console.log(`📎 Using multimodal quiz generation (${rawContent.parts.length / 2} file(s) inline)`);
      raw = await generateJsonFromParts(allParts);
    } else {
      console.log("📝 Using text-only quiz generation");
      raw = await generateJson(promptText);
    }

    // ── Validate with Zod (no silent crashes) ──
    let questions: z.infer<typeof QuizArraySchema>;
    try {
      const parsed = JSON.parse(raw);
      questions = QuizArraySchema.parse(Array.isArray(parsed) ? parsed : [parsed]);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(
        `Gemini returned invalid quiz JSON: ${msg}. Raw: ${raw.slice(0, 200)}`,
      );
    }

    // ── Enforce question count (clamp to requested) ──
    const finalQuestions = questions.slice(0, questionCount).map((q, i) => ({
      ...q,
      order: i,
    }));

    // ── Save quiz — delete existing quiz for this session first, then insert new one ──
    await db.delete(quizzes).where(eq(quizzes.sessionId, sessionId));

    const [quiz] = await db
      .insert(quizzes)
      .values({ sessionId, groupId })
      .returning();

    await db.insert(quizQuestions).values(
      finalQuestions.map((q) => ({
        quizId: quiz.id,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        order: q.order,
      })),
    );

    console.log(`✅ Quiz generated for session: ${sessionId} (${finalQuestions.length} questions)`);

    // ── Notify all clients in the session room ──
    const io = getIo();
    if (io) {
      io.to(sessionId).emit("quiz:ready", {
        quizId: quiz.id,
        sessionId,
        questionCount: finalQuestions.length,
      });
      console.log(`📡 quiz:ready emitted for session: ${sessionId}`);
    }

    return { quizId: quiz.id, questionCount: finalQuestions.length };
  } catch (err) {
    console.error(`❌ Failed to generate quiz for session ${sessionId}:`, err);

    // ── Notify clients of failure ──
    const io = getIo();
    if (io) {
      io.to(sessionId).emit("quiz:error", {
        sessionId,
        message: "Quiz generation failed. Please try again.",
      });
    }

    throw err;
  }
};
