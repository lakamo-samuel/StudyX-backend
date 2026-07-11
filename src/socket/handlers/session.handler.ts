import { Socket, Server } from "socket.io";
import { db } from "../../config/db";
import { sessions } from "../../db/schema/sessions";
import { groupMembers } from "../../db/schema/groups";
import { eq, and } from "drizzle-orm";
import { sessionQueue } from "../../jobs/queue";

export const registerSessionHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  // ── START SESSION — admin only ──
  socket.on("session:start", async (data: { sessionId: string }) => {
    try {
      const { sessionId } = data;

      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (!session) return;
      if (session.status !== "ready" && session.status !== "scheduled") return;

      // Only the group admin can start a session via socket
      const [member] = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, session.groupId),
            eq(groupMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!member) return;
      if (member.role !== "admin") {
        socket.emit("session:error", { message: "Only the group admin can start a session." });
        return;
      }

      const [updated] = await db
        .update(sessions)
        .set({
          status: "active",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();

      io.to(sessionId).emit("session:started", { session: updated });

      // schedule auto-end after 4 hours of inactivity
      await sessionQueue.add(
        "auto-end-session",
        { sessionId },
        { delay: 1000 * 60 * 60 * 4 },
      );

      console.log(`▶️ Session ${sessionId} started by ${userId} (admin)`);
    } catch (err) {
      console.error("❌ Session start error:", err);
    }
  });

  // ── END SESSION ──
  socket.on("session:end", async (data: { sessionId: string }) => {
    try {
      const { sessionId } = data;

      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (!session) return;
      if (session.status !== "active") return;

      // check if admin is present — if so only admin can end
      // if admin not present any member can end
      const [member] = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, session.groupId),
            eq(groupMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!member) return;

      const [updated] = await db
        .update(sessions)
        .set({
          status: "ended",
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();

      io.to(sessionId).emit("session:ended", { session: updated });

      console.log(`⏹️ Session ${sessionId} ended by ${userId}`);
    } catch (err) {
      console.error("❌ Session end error:", err);
    }
  });

  // ── SESSION STATUS CHANGED (broadcast to room) ──
  socket.on(
    "session:status",
    async (data: { sessionId: string; status: string }) => {
      io.to(data.sessionId).emit("session:status", data);
    },
  );
};
