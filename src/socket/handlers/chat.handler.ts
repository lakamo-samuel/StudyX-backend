import { Socket, Server } from "socket.io";
import { db } from "../../config/db";
import { messages } from "../../db/schema/messages";
import { users } from "../../db/schema/users";
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

      // verify user is in this session's group
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

      // save to database
      const [message] = await db
        .insert(messages)
        .values({ sessionId, userId, text: text.trim() })
        .returning();

      // get user details
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const fullMessage = { ...message, user };

      // broadcast to everyone in the session room including sender
      io.to(sessionId).emit("chat:message", fullMessage);
    } catch (err) {
      console.error("❌ Chat send error:", err);
      socket.emit("chat:error", { message: "Failed to send message" });
    }
  });
};
