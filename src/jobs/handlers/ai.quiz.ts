import { db } from "../../config/db";
import { quizzes, quizQuestions } from "../../db/schema/quizzes";
import { files } from "../../db/schema/toolkit";
import { sessions } from "../../db/schema/sessions";
import { eq } from "drizzle-orm";
import { generateContent } from "../../lib/gemini";

export const handleAiQuiz = async (job: {
  data: {
    sessionId: string;
    groupId: string;
    fileIds: string[];
    topic?: string;
  };
}) => {
  const { sessionId, groupId, fileIds, topic, questionCount = 5 } = job.data;

  console.log(`🤖 Generating quiz for session: ${sessionId}`);

  try {
    // get file summaries for context
    const groupFiles = await db
      .select()
      .from(files)
      .where(eq(files.groupId, groupId));

    const relevantFiles =
      fileIds.length > 0
        ? groupFiles.filter((f) => fileIds.includes(f.id))
        : groupFiles;

    const fileContext = relevantFiles
      .filter((f) => f.summary)
      .map((f) => `File: ${f.name}\nSummary: ${f.summary}`)
      .join("\n\n");

    const prompt = `
      You are an academic quiz generator for university students.
      ${topic ? `Topic: ${topic}` : ""}
      ${fileContext ? `Study materials context:\n${fileContext}` : ""}
      
      Generate exactly ${questionCount} multiple choice quiz questions.
      
      Return ONLY a valid JSON array — no markdown, no explanation, no extra text:
      [
        {
          "question": "Question text here?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "Option A",
          "order": 0
        }
      ]
      
      Rules:
      - Each question must have exactly 4 options
      - correctAnswer must exactly match one of the options
      - Questions should test understanding, not memorization
      - order goes from 0 to ${questionCount - 1}
      - You MUST return exactly ${questionCount} questions, no more, no less
    `;

    const raw = await generateContent(prompt);

    // parse the JSON response
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const questions = JSON.parse(cleaned) as Array<{
      question: string;
      options: string[];
      correctAnswer: string;
      order: number;
    }>;

    // save quiz to database
    const [quiz] = await db
      .insert(quizzes)
      .values({ sessionId, groupId })
      .returning();

    await Promise.all(
      questions.map((q) =>
        db.insert(quizQuestions).values({
          quizId: quiz.id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          order: q.order,
        }),
      ),
    );

    console.log(`✅ Quiz generated for session: ${sessionId}`);

    return { quizId: quiz.id, questionCount: questions.length };
  } catch (err) {
    console.error(`❌ Failed to generate quiz for session ${sessionId}:`, err);
    throw err;
  }
};
