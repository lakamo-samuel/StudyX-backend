import { Socket } from "socket.io";
import { verifyToken } from "../../lib/token";
import { db } from "../../config/db";
import { users } from "../../db/schema/users";
import { eq } from "drizzle-orm";

export const socketAuth = async (
  socket: Socket,
  next: (err?: Error) => void,
) => {
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = verifyToken(token);
    socket.data.userId = payload.userId;
    socket.data.email = payload.email;

    // Cache user profile at connection time — eliminates N+1 query on every chat message
    const [user] = await db
      .select({ id: users.id, name: users.name, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (user) {
      socket.data.userName = user.name;
      socket.data.userAvatar = user.avatar;
    }

    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
};
