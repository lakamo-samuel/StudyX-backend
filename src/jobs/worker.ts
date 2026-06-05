import { Worker } from "bullmq";
import { handleAiSummarize } from "./handlers/ai.summarize";
import { handleAiQuiz } from "./handlers/ai.quiz";
import { handleAiAgenda } from "./handlers/ai.agenda";
import { handleSessionAutoEnd } from "./handlers/session.autoend";

const connection = {
  host: "localhost",
  port: 6380,
  db: 0,
};

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
