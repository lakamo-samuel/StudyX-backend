import { Socket, Server } from "socket.io";
import { redis } from "../../config/redis";
import { db } from "../../config/db";
import { sessionParticipants } from "../../db/schema/sessions";
import { eq, and } from "drizzle-orm";

export const registerPresenceHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  // ── JOIN SESSION ROOM ──
  socket.on("presence:join", async (data: { sessionId: string }) => {
    const { sessionId } = data;
    const roomKey = `session:${sessionId}:presence`;

    await socket.join(sessionId);
    await redis.sadd(roomKey, userId);
    await redis.expire(roomKey, 60 * 60 * 4); // 4 hours

    // Persist join to DB — wrapped in try/catch so a missing table never crashes the server
    try {
      const existing = await db
        .select()
        .from(sessionParticipants)
        .where(
          and(
            eq(sessionParticipants.sessionId, sessionId),
            eq(sessionParticipants.userId, userId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(sessionParticipants).values({ sessionId, userId });
      } else if (existing[0].leftAt !== null) {
        await db
          .update(sessionParticipants)
          .set({ leftAt: null })
          .where(eq(sessionParticipants.id, existing[0].id));
      }
    } catch (err) {
      console.warn(`⚠️ Could not update session_participants (table may not exist yet): ${(err as Error).message}`);
    }

    const onlineUsers = await redis.smembers(roomKey);

    io.to(sessionId).emit("presence:updated", {
      sessionId,
      onlineUsers,
      joined: userId,
    });

    console.log(`👤 User ${userId} joined session ${sessionId}`);
  });

  // ── LEAVE SESSION ROOM ──
  socket.on("presence:leave", async (data: { sessionId: string }) => {
    const { sessionId } = data;
    await _handleLeave(io, socket, sessionId, userId);
  });

  // ── TYPING INDICATOR ──
  socket.on("presence:typing", (data: { sessionId: string }) => {
    socket.to(data.sessionId).emit("presence:typing", {
      userId,
      sessionId: data.sessionId,
    });
  });

  // ── DISCONNECT ──
  socket.on("disconnect", async () => {
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    await Promise.all(rooms.map((sessionId) => _handleLeave(io, socket, sessionId, userId)));
    console.log(`👤 User ${userId} disconnected`);
  });
};

// ── shared leave logic ──
async function _handleLeave(
  io: Server,
  socket: Socket,
  sessionId: string,
  userId: string,
) {
  const roomKey = `session:${sessionId}:presence`;

  await socket.leave(sessionId);
  await redis.srem(roomKey, userId);

  // Record leave time in DB — wrapped in try/catch so a missing table
  // or any DB error never crashes the server process
  try {
    await db
      .update(sessionParticipants)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(sessionParticipants.sessionId, sessionId),
          eq(sessionParticipants.userId, userId),
        ),
      );
  } catch (err) {
    console.warn(`⚠️ Could not update session_participants (table may not exist yet): ${(err as Error).message}`);
  }

  const onlineUsers = await redis.smembers(roomKey);

  io.to(sessionId).emit("presence:updated", {
    sessionId,
    onlineUsers,
    left: userId,
  });

  console.log(`👤 User ${userId} left session ${sessionId}`);
}
