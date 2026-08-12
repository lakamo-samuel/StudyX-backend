import { z } from "zod";
import { db } from "../../config/db";
import { sessionAgenda, sessions } from "../../db/schema/sessions";
import { eq } from "drizzle-orm";
import { generateJson, generateJsonFromParts } from "../../lib/gemini";
import { buildGroupContext, buildToolkitRawContent } from "../../lib/ai-context";
import { getIo } from "../../socket/socket-instance";
import type { Part } from "@google/generative-ai";

// ────────────────────────────────────────────────────────
//  ZOD SCHEMA — validates every agenda item Gemini returns
// ────────────────────────────────────────────────────────
const AgendaItemSchema = z.object({
  topic: z.string().min(2).max(200),
  timeBlock: z.string().min(1).max(50),
  durationMinutes: z.number().int().min(1).max(180),
  order: z.number().int().min(0),
});

const AgendaArraySchema = z.array(AgendaItemSchema).min(2).max(12);

// ────────────────────────────────────────────────────────
//  AGENDA GENERATION JOB
// ────────────────────────────────────────────────────────
export const handleAiAgenda = async (job: {
  data: {
    sessionId: string;
    groupId: string;
    duration?: number;
    fileIds?: string[];
  };
}) => {
  const { sessionId, groupId, duration = 90, fileIds } = job.data;

  console.log(`🤖 Generating agenda for session: ${sessionId}`);

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    // ── Load actual file content (PDFs/images inline, DOCX/TXT extracted) ──
    const [groupCtx, rawContent] = await Promise.all([
      buildGroupContext(groupId),
      buildToolkitRawContent(
        groupId,
        fileIds && fileIds.length > 0 ? fileIds : undefined,
      ),
    ]);

    const textMaterialsSection =
      rawContent.textBlocks.length > 0
        ? `Study materials for this session (use to plan topic blocks):\n\n${rawContent.textBlocks.join("\n\n")}`
        : "";

    const noMaterialsNote =
      !rawContent.hasMaterial
        ? "No study materials uploaded — plan based on the session title and goal."
        : "";

    const promptText = `
You are a professional academic session planner for university students.

${groupCtx.contextString}
Session title: "${session?.title ?? "Study Session"}"
Session goal: "${session?.goal ?? "Study effectively"}"
Session duration: ${duration} minutes

${textMaterialsSection}
${noMaterialsNote}
${rawContent.parts.length > 0 ? "The study materials are attached as files. Read them to identify specific topics for the agenda." : ""}

Create a well-structured session agenda. The time blocks MUST add up to exactly ${duration} minutes.

Structure:
- Start with a warm-up/review block (5–10 min)
- Include substantive topic blocks covering the session goal and materials (name specific topics from the materials)
- If duration > 60 min, add a short break (5–10 min)
- End with a Q&A/wrap-up block (10–15 min)
- Total items: 4–7 (inclusive)

Return ONLY a JSON array — no markdown fences, no explanation:
[
  {
    "topic": "Warm-up: Review last session",
    "timeBlock": "0:00 – 0:10",
    "durationMinutes": 10,
    "order": 0
  }
]

CRITICAL: The sum of all durationMinutes values MUST equal exactly ${duration}.
    `.trim();

    // ── Choose call strategy: multimodal (PDF/image parts) vs text-only ──
    let raw: string;
    if (rawContent.parts.length > 0) {
      const allParts: Part[] = [
        { text: promptText } as Part,
        ...(rawContent.textBlocks.length > 0
          ? [{ text: rawContent.textBlocks.join("\n\n") } as Part]
          : []),
        ...rawContent.parts,
      ];
      console.log(`📎 Using multimodal agenda generation (${rawContent.parts.length / 2} file(s) inline)`);
      raw = await generateJsonFromParts(allParts);
    } else {
      console.log("📝 Using text-only agenda generation");
      raw = await generateJson(promptText);
    }

    // ── Validate with Zod ──
    let agendaItems: z.infer<typeof AgendaArraySchema>;
    try {
      const parsed = JSON.parse(raw);
      agendaItems = AgendaArraySchema.parse(
        Array.isArray(parsed) ? parsed : [parsed],
      );
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(
        `Gemini returned invalid agenda JSON: ${msg}. Raw: ${raw.slice(0, 200)}`,
      );
    }

    // ── Validate and fix time sum ──
    const totalMinutes = agendaItems.reduce(
      (sum, item) => sum + item.durationMinutes,
      0,
    );

    let finalItems = agendaItems;

    if (Math.abs(totalMinutes - duration) > 5) {
      console.warn(
        `⚠️  Agenda time sum (${totalMinutes} min) deviates from target (${duration} min). Scaling...`,
      );
      const scale = duration / totalMinutes;
      let accumulated = 0;
      finalItems = agendaItems.map((item, i) => {
        const scaledDuration =
          i === agendaItems.length - 1
            ? duration - accumulated
            : Math.max(1, Math.round(item.durationMinutes * scale));
        accumulated += scaledDuration;
        const start = accumulated - scaledDuration;
        const startH = Math.floor(start / 60);
        const startM = start % 60;
        const endH = Math.floor(accumulated / 60);
        const endM = accumulated % 60;
        const fmt = (h: number, m: number) =>
          `${h}:${String(m).padStart(2, "0")}`;
        return {
          ...item,
          durationMinutes: scaledDuration,
          timeBlock: `${fmt(startH, startM)} – ${fmt(endH, endM)}`,
          order: i,
        };
      });
    }

    // ── Delete existing agenda and insert new one ──
    await db
      .delete(sessionAgenda)
      .where(eq(sessionAgenda.sessionId, sessionId));

    await db.insert(sessionAgenda).values(
      finalItems.map((item) => ({
        sessionId,
        topic: item.topic,
        timeBlock: item.timeBlock,
        order: item.order,
        done: false,
      })),
    );

    // ── Fetch updated session and agenda to broadcast ──
    const [updatedSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const agenda = await db
      .select()
      .from(sessionAgenda)
      .where(eq(sessionAgenda.sessionId, sessionId))
      .orderBy(sessionAgenda.order);

    const io = getIo();
    if (io && updatedSession) {
      io.to(sessionId).emit("session:agenda:updated", {
        session: { ...updatedSession, agenda },
      });
    }

    console.log(`✅ Agenda generated for session: ${sessionId} (${finalItems.length} items, ${duration} min)`);

    return { sessionId, itemCount: finalItems.length };
  } catch (err) {
    console.error(
      `❌ Failed to generate agenda for session ${sessionId}:`,
      err,
    );

    // Notify clients so the UI can show an error instead of spinning forever
    const io = getIo();
    if (io) {
      const isRateLimit = (err as { status?: number })?.status === 429;
      io.to(sessionId).emit("agenda:error", {
        sessionId,
        message: isRateLimit
          ? "AI quota reached — please try again in a few minutes."
          : "Agenda generation failed. Please try again.",
      });
    }

    throw err;
  }
};
