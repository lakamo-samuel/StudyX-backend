import { Socket } from "socket.io";
import { verifyToken } from "../../lib/token";

export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
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

    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
};
