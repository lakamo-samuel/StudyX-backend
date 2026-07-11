import "dotenv/config";
import http from "http";
import app from "./app";
import { env } from "./config/env";
import { redis } from "./config/redis";
import { db } from "./config/db";
import { sql } from "drizzle-orm";
import { initSocket } from "./socket";

// start workers
import "./jobs/worker";

const PORT = env.PORT || 3000;

const start = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connected");

    await redis.ping();
    console.log("✅ Redis connected");

    // create HTTP server
    const httpServer = http.createServer(app);

    // attach Socket.io
    const io = initSocket(httpServer);

    // make io accessible in routes if needed
    app.set("io", io);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Vyrdly server running on port ${PORT}`);
      console.log(`📡 Environment: ${env.NODE_ENV}`);
      console.log(`🔌 Socket.io ready`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
};

start();
