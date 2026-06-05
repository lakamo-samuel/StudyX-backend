import { Queue } from "bullmq";
import { env } from "../config/env";

const connection = {
  host: "localhost",
  port: 6380,
  db: 0,
};

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
