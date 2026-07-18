import { db } from "../../config/db";
import { sessions } from "../../db/schema/sessions";
import { groupMembers } from "../../db/schema/groups";
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
    const [groupCtx, transcript, toolkitContext, memberResult] =
      await Promise.all([
        buildGroupContext(groupId),
        buildSessionTranscript(sessionId, 300),
        buildToolkitContext(groupId),
        db
          .select({ count: count() })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, groupId),
            ),
          ),
      ]);

    const memberCount = Number(memberResult[0]?.count ?? 0);
    const hasTranscript = transcript.text.trim().length > 0;

    const prompt = `
You are writing a comprehensive study session debrief for university students.

${groupCtx.contextString}
Session: "${session.title}"
Goal: "${session.goal ?? "Study effectively"}"
Duration: ${durationStr}
Participants: ${memberCount} students
${toolkitContext ? `\nStudy materials used:\n${toolkitContext}` : ""}

${
  hasTranscript
    ? `Session chat transcript (what students discussed):\n${transcript.text.slice(0, 5000)}`
    : "No chat messages were recorded during this session."
}

Write a comprehensive session summary structured exactly as follows:

WHAT WAS COVERED
Write 2–3 paragraphs describing the main topics discussed, concepts explained, and key decisions or conclusions reached during the session. Be specific — reference actual things discussed, not generic statements.

KEY TAKEAWAYS
List 5–7 of the most important things students learned or concluded from this session. Each takeaway should be a complete, informative sentence.

UNRESOLVED QUESTIONS
List any topics that were raised but not fully resolved, or areas where students seemed confused or needed more time. If none were detected, say "All major questions were addressed in this session."

NEXT STEPS
List 3–4 concrete action items or topics the group should focus on in the next session based on what happened in this one.

PARTICIPATION SUMMARY
Write 2–3 sentences on the overall quality and engagement of the discussion (was it focused? Did students contribute actively? Was the session productive?). Do NOT name or identify individual participants.

Target length: 500–700 words. Be specific and reference actual session content where available.
Do NOT use markdown symbols. Use the section headers exactly as shown above.
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
