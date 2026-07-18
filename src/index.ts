import "dotenv/config";
import http from "http";
import app from "./app";
import { env } from "./config/env";
import { redis } from "./config/redis";
import { db } from "./config/db";
import { sql } from "drizzle-orm";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";

import "./jobs/worker";

const PORT = env.PORT || 3000;

const httpServer = http.createServer(app);

const start = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("✅ Database connected");

    await redis.ping();
    logger.info("✅ Redis connected");

 
    // attach Socket.io
    const io = initSocket(httpServer);

    // make io accessible in routes if needed
    app.set("io", io);

    httpServer.listen(PORT, () => {
      logger.info(`🚀 Vyrdly server running on port ${PORT}`);
      logger.info(`📡 Environment: ${env.NODE_ENV}`);
      logger.info(`🔌 Socket.io ready`);
    });
  } catch (err) {
    logger.fatal({err}, "❌ Failed to start server:");
    process.exit(1);
  }
};

start();

let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully`)
  try {

    await new Promise((resolve) => {
      httpServer.close(() => {
        logger.info("HTTP server closed")
        resolve(true)
      })
    })
  
    await redis.quit();
    logger.info("Redis connection closed")
    process.exit(0)
    
  }catch(error){
    logger.error({ error }, "Error during shutdown")
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))