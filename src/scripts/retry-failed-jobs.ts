/**
 * One-off script: retry all failed AI summarize jobs so they run with the new fallback handler.
 * Usage: npx tsx src/scripts/retry-failed-jobs.ts
 */
import "dotenv/config";
import { aiQueue } from "../jobs/queue";

async function retryFailedJobs() {
  const failed = await aiQueue.getFailed();
  console.log(`Found ${failed.length} failed jobs`);

  let retried = 0;
  for (const job of failed) {
    if (job.name === "summarize-file") {
      await job.retry();
      console.log(`  ↻ Retried job ${job.id}: ${job.data.fileName}`);
      retried++;
    }
  }

  console.log(`\n✅ Retried ${retried} summarize jobs`);
  process.exit(0);
}

retryFailedJobs().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
