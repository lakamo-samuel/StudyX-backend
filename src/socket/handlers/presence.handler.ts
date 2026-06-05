import { Socket, Server } from "socket.io";
import { redis } from "../../config/redis";

export const registerPresenceHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  // ── JOIN SESSION ROOM ──
  socket.on("presence:join", async (data: { sessionId: string }) => {
    const { sessionId } = data;
    const roomKey = `session:${sessionId}:presence`;

    await socket.join(sessionId);
    await redis.sadd(roomKey, userId);
    await redis.expire(roomKey, 60 * 60 * 4); // 4 hours

    const onlineUsers = await redis.smembers(roomKey);

    // notify everyone in room
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
    const roomKey = `session:${sessionId}:presence`;

    await socket.leave(sessionId);
    await redis.srem(roomKey, userId);

    const onlineUsers = await redis.smembers(roomKey);

    io.to(sessionId).emit("presence:updated", {
      sessionId,
      onlineUsers,
      left: userId,
    });

    console.log(`👤 User ${userId} left session ${sessionId}`);
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
    // remove from all session rooms on disconnect
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);

    await Promise.all(
      rooms.map(async (sessionId) => {
        const roomKey = `session:${sessionId}:presence`;
        await redis.srem(roomKey, userId);
        const onlineUsers = await redis.smembers(roomKey);

        io.to(sessionId).emit("presence:updated", {
          sessionId,
          onlineUsers,
          left: userId,
        });
      }),
    );

    console.log(`👤 User ${userId} disconnected`);
  });
};
