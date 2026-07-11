import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { env } from "./config/env";
import { socketAuth } from "./socket/middleware/socket.auth";
import { registerPresenceHandlers } from "./socket/handlers/presence.handler";
import { registerChatHandlers } from "./socket/handlers/chat.handler";
import { registerSessionHandlers } from "./socket/handlers/session.handler";
import { registerQuizHandlers } from "./socket/handlers/quiz.handler";
import { registerToolkitHandlers } from "./socket/handlers/toolkit.handler";
import { setIo } from "./socket/socket-instance";

export const initSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // make io available to background job workers
  setIo(io);

  // ── AUTH MIDDLEWARE ──
  io.use(socketAuth);

  // ── REGISTER HANDLERS ──
  io.on("connection", (socket) => {
    console.log(
      `🔌 Socket connected: ${socket.id} (user: ${socket.data.userId})`,
    );

    registerPresenceHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerSessionHandlers(io, socket);
    registerQuizHandlers(io, socket);
    registerToolkitHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};
