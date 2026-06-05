import { db } from "../../config/db";
import { sessions } from "../../db/schema/sessions";
import { eq } from "drizzle-orm";

export const handleSessionAutoEnd = async (job: {
  data: { sessionId: string };
}) => {
  const { sessionId } = job.data;

  console.log(`⏱️ Checking auto-end for session: ${sessionId}`);

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      console.log(`Session ${sessionId} not found — skipping`);
      return;
    }

    if (session.status !== "active") {
      console.log(`Session ${sessionId} is not active — skipping`);
      return;
    }

    await db
      .update(sessions)
      .set({
        status: "ended",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    console.log(`✅ Session ${sessionId} auto-ended`);

    return { sessionId, autoEnded: true };
  } catch (err) {
    console.error(`❌ Failed to auto-end session ${sessionId}:`, err);
    throw err;
  }
};
