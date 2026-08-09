import { db } from "../../config/db";
import { sessions, sessionAgenda } from "../../db/schema/sessions";
import { groupMembers } from "../../db/schema/groups";
import { quizzes, quizQuestions, quizAnswers } from "../../db/schema/quizzes";
import { eq, and, count } from "drizzle-orm";
import {
  buildGroupContext,
  buildSessionTranscript,
  buildToolkitContext,
} from "../../lib/ai-context";
import { generateChatContent } from "../../lib/gemini";
import { getIo } from "../../socket/socket-instance";

// ────────────────────────────────────────────────────────
//  SESSION SUMMARY JOB
//  Triggered on session:end — listens to the full chat
//  transcript and produces a comprehensive debrief summary.
// ────────────────────────────────────────────────────────
export const handleAiSessionSummary = async (job: {
  data: {
    sessionId: string;
    groupId: string;
  };
}) => {
  const { sessionId, groupId } = job.data;

  console.log(`🤖 Generating session summary for: ${sessionId}`);

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Compute duration
    let durationStr = "Unknown duration";
    if (session.startedAt && session.endedAt) {
      const diffMs =
        session.endedAt.getTime() - session.startedAt.getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 60) durationStr = `${diffMins} minutes`;
      else {
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        durationStr = `${hrs} hr${hrs > 1 ? "s" : ""} ${mins > 0 ? `${mins} min` : ""}`.trim();
      }
    }

    // Build all context in parallel
    const [groupCtx, transcript, toolkitContext, memberResult, agendaItems] =
      await Promise.all([
        buildGroupContext(groupId),
        buildSessionTranscript(sessionId, 300),
        buildToolkitContext(groupId),
        db
          .select({ count: count() })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId))),
        db
          .select()
          .from(sessionAgenda)
          .where(eq(sessionAgenda.sessionId, sessionId))
          .orderBy(sessionAgenda.order),
      ]);

    const memberCount = Number(memberResult[0]?.count ?? 0);
    const hasTranscript = transcript.text.trim().length > 0;

    // Fetch quiz performance for context
    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.sessionId, sessionId))
      .limit(1);

    let quizSummaryText = "No quiz was taken during this session.";
    if (quiz) {
      const allAnswers = await db
        .select()
        .from(quizAnswers)
        .where(eq(quizAnswers.quizId, quiz.id));

      const questions = await db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quiz.id))
        .orderBy(quizQuestions.order);

      const totalQuestions = questions.length;
      const participantIds = [...new Set(allAnswers.map((a) => a.userId))];
      const totalParticipants = participantIds.length;

      // Per-question accuracy
      const questionStats = questions.map((q) => {
        const qAnswers = allAnswers.filter((a) => a.questionId === q.id);
        const correct = qAnswers.filter((a) => a.isCorrect).length;
        const pct =
          qAnswers.length > 0
            ? Math.round((correct / qAnswers.length) * 100)
            : 0;
        return { question: q.question, pct, correct, total: qAnswers.length };
      });

      const weakQuestions = questionStats
        .filter((q) => q.pct < 60)
        .map((q) => `"${q.question}" (${q.pct}% correct)`);

      const strongQuestions = questionStats
        .filter((q) => q.pct >= 80)
        .map((q) => `"${q.question}" (${q.pct}% correct)`);

      quizSummaryText = [
        `Quiz: ${totalQuestions} questions, ${totalParticipants} participant(s) answered.`,
        strongQuestions.length > 0
          ? `Strong questions (>=80%): ${strongQuestions.join("; ")}`
          : "",
        weakQuestions.length > 0
          ? `Weak questions (<60%): ${weakQuestions.join("; ")}`
          : "All questions were answered well.",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const agendaText =
      agendaItems.length > 0
        ? agendaItems
            .map(
              (item) =>
                `  ${item.done ? "[done]" : "[not done]"} ${item.topic}`,
            )
            .join("\n")
        : "No agenda was set.";

    const prompt = `
You are writing a comprehensive study session debrief for university students.

${groupCtx.contextString}
Session: "${session.title}"
Goal: "${session.goal ?? "Study effectively"}"
Duration: ${durationStr}
Participants: ${memberCount} students

Agenda covered:
${agendaText}
${toolkitContext ? `\nStudy materials used:\n${toolkitContext}` : ""}

Quiz performance:
${quizSummaryText}

${
  hasTranscript
    ? `Session chat transcript (what students discussed):\n${transcript.text.slice(0, 5000)}`
    : "No chat messages were recorded during this session."
}

Write a comprehensive session summary structured exactly as follows. Use the section headers exactly as shown. Do NOT use markdown symbols like ** or #.

WHAT WAS COVERED
2-3 paragraphs describing the main topics discussed, concepts explained, and key points from the session. Reference the agenda items, study materials, and anything from the chat transcript. Be specific — not generic.

KEY TAKEAWAYS
List 5-7 of the most important things students should remember from this session. Each should be a complete, informative sentence tied to the actual content.

AREAS THAT NEED MORE WORK
Based on the quiz performance and discussion, list the specific topics or concepts the group struggled with. If quiz data shows weak questions, name the exact concepts. If no quiz, infer from the discussion.

WHAT TO STUDY NEXT
List 3-4 concrete topics or action items the group should focus on before the next session, based on gaps identified today.

SESSION QUALITY
2-3 sentences on how productive and focused the session was overall. Was the agenda completed? Did the discussion stay on track? Do not name individual participants.

Target length: 500-700 words total. Be specific and reference actual session content.
    `.trim();

    const summary = await generateChatContent(prompt);

    // Save summary to the session record
    await db
      .update(sessions)
      .set({ aiSummary: summary, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    console.log(`✅ Session summary saved for: ${sessionId}`);

    // Push to session room so clients can display it immediately
    const io = getIo();
    if (io) {
      io.to(sessionId).emit("session:summary:ready", {
        sessionId,
        summary,
      });
      console.log(`📡 session:summary:ready emitted for: ${sessionId}`);
    }

    return { sessionId, summaryLength: summary.length };
  } catch (err) {
    console.error(
      `❌ Failed to generate session summary for ${sessionId}:`,
      err,
    );
    throw err;
  }
};
