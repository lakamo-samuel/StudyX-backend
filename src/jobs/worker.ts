import "dotenv/config";
import { Worker } from "bullmq";
import { env } from "../config/env";
import { handleAiSummarize } from "./handlers/ai.summarize";
import { handleAiQuiz } from "./handlers/ai.quiz";
import { handleAiAgenda } from "./handlers/ai.agenda";
import { handleAiSessionSummary } from "./handlers/ai.session-summary";
import { handleSessionAutoEnd } from "./handlers/session.autoend";

// BullMQ bundles its own ioredis — parse URL into plain connection options
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  const isTls = parsed.protocol === "rediss:";
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || (isTls ? "6380" : "6379")),
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname.slice(1) || "0"),
    maxRetriesPerRequest: null as null,
    // Required for Upstash and other TLS Redis providers (rediss://)
    tls: isTls ? {} : undefined,
  };
}

const connection = parseRedisUrl(env.REDIS_URL);

const aiWorker = new Worker(
  "ai-jobs",
  async (job) => {
    switch (job.name) {
      case "summarize-file":
        return handleAiSummarize(job as any);
      case "generate-quiz":
        return handleAiQuiz(job as any);
      case "generate-agenda":
        return handleAiAgenda(job as any);
      case "summarize-session":
        return handleAiSessionSummary(job as any);
      default:
        console.warn(`Unknown AI job: ${job.name}`);
    }
  },
  { connection, concurrency: 3 },
);

const sessionWorker = new Worker(
  "session-jobs",
  async (job) => {
    switch (job.name) {
      case "auto-end-session":
        return handleSessionAutoEnd(job as any);
      default:
        console.warn(`Unknown session job: ${job.name}`);
    }
  },
  { connection },
);

aiWorker.on("completed", (job) => {
  console.log(`✅ AI job completed: ${job.name} [${job.id}]`);
});

aiWorker.on("failed", (job, err) => {
  console.error(`❌ AI job failed: ${job?.name} [${job?.id}]`, err.message);
});

sessionWorker.on("completed", (job) => {
  console.log(`✅ Session job completed: ${job.name} [${job.id}]`);
});

sessionWorker.on("failed", (job, err) => {
  console.error(
    `❌ Session job failed: ${job?.name} [${job?.id}]`,
    err.message,
  );
});

console.log("👷 Workers running — AI + Session queues active");

export { aiWorker, sessionWorker };
