import { Socket, Server } from "socket.io";
import { db } from "../../config/db";
import { messages } from "../../db/schema/messages";
import { sessions } from "../../db/schema/sessions";
import { groupMembers } from "../../db/schema/groups";
import { eq, and } from "drizzle-orm";

export const registerChatHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  // ── SEND MESSAGE ──
  socket.on("chat:send", async (data: { sessionId: string; text: string }) => {
    try {
      const { sessionId, text } = data;

      if (!text?.trim()) return;

      // Hard limit on message length — prevents token/DB abuse
      if (text.length > 5000) {
        socket.emit("chat:error", { message: "Message too long (max 5000 characters)" });
        return;
      }

      // Verify user is in this session's group
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (!session) return;

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

      // Save to database (non-AI chat message)
      const [message] = await db
        .insert(messages)
        .values({ sessionId, userId, text: text.trim(), isAiChat: false, isAiResponse: false })
        .returning();

      // Use cached user profile from socket.data — no extra DB query needed
      const user = {
        id: userId,
        name: socket.data.userName ?? "Unknown",
        avatar: socket.data.userAvatar ?? null,
      };

      const fullMessage = { ...message, user };

      // Broadcast to everyone in the session room including sender
      io.to(sessionId).emit("chat:message", fullMessage);
    } catch (err) {
      console.error("❌ Chat send error:", err);
      socket.emit("chat:error", { message: "Failed to send message" });
    }
  });
};
