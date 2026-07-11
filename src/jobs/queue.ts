import { Queue } from "bullmq";
import { env } from "../config/env";

// BullMQ bundles its own ioredis — use plain options, not an external IORedis instance
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname.slice(1) || "0"),
    maxRetriesPerRequest: null as null,
  };
}

const connection = parseRedisUrl(env.REDIS_URL);

export const aiQueue = new Queue("ai-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const sessionQueue = new Queue("session-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});
