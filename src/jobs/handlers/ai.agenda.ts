import { db } from "../../config/db";
import { sessionAgenda, sessions } from "../../db/schema/sessions";
import { files } from "../../db/schema/toolkit";
import { eq } from "drizzle-orm";
import { generateContent } from "../../lib/gemini";

export const handleAiAgenda = async (job: {
  data: {
    sessionId: string;
    groupId: string;
    duration?: number;
  };
}) => {
  const { sessionId, groupId, duration = 90 } = job.data;

  console.log(`🤖 Generating agenda for session: ${sessionId}`);

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const groupFiles = await db
      .select({ name: files.name, summary: files.summary })
      .from(files)
      .where(eq(files.groupId, groupId));

    const fileContext = groupFiles
      .filter((f) => f.summary)
      .map((f) => `- ${f.name}: ${f.summary}`)
      .join("\n");

    const prompt = `
      You are an academic session planner for university students.
      Session title: "${session?.title || "Study Session"}"
      Session goal: "${session?.goal || "Study effectively"}"
      Duration: ${duration} minutes
      ${fileContext ? `Available study materials:\n${fileContext}` : ""}
      
      Create a structured study session agenda.
      
      Return ONLY a valid JSON array, no markdown, no explanation:
      [
        {
          "topic": "Topic name here",
          "timeBlock": "0:00 – 0:20",
          "order": 0
        }
      ]
      
      Rules:
      - Create 4-6 agenda items that fit within ${duration} minutes
      - Time blocks should be realistic and add up to the total duration
      - Start with a review/warmup, end with questions/wrap-up
      - order starts at 0
    `;

    const raw = await generateContent(prompt);

    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const agendaItems = JSON.parse(cleaned) as Array<{
      topic: string;
      timeBlock: string;
      order: number;
    }>;

    // delete existing agenda items first
    await db
      .delete(sessionAgenda)
      .where(eq(sessionAgenda.sessionId, sessionId));

    // insert new AI generated agenda
    await Promise.all(
      agendaItems.map((item) =>
        db.insert(sessionAgenda).values({
          sessionId,
          topic: item.topic,
          timeBlock: item.timeBlock,
          order: item.order,
          done: false,
        }),
      ),
    );

    console.log(`✅ Agenda generated for session: ${sessionId}`);

    return { sessionId, itemCount: agendaItems.length };
  } catch (err) {
    console.error(
      `❌ Failed to generate agenda for session ${sessionId}:`,
      err,
    );
    throw err;
  }
};
