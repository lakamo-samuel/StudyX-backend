import { z } from "zod";

export const createQuizSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  groupId: z.string().uuid("Invalid group ID"),
  questions: z
    .array(
      z.object({
        question: z.string().min(1, "Question is required"),
        options: z
          .array(z.string())
          .min(2, "At least 2 options required")
          .max(4),
        correctAnswer: z.string().min(1, "Correct answer is required"),
        order: z.number().int().default(0),
      }),
    )
    .min(1, "At least one question is required"),
});

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid("Invalid question ID"),
  answer: z.string().min(1, "Answer is required"),
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
