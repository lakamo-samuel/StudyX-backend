import { Socket, Server } from "socket.io";
import { db } from "../../config/db";
import { quizzes, quizQuestions, quizAnswers } from "../../db/schema/quizzes";
import { sessions } from "../../db/schema/sessions";
import { groupMembers } from "../../db/schema/groups";
import { users } from "../../db/schema/users";
import { eq, and } from "drizzle-orm";
import { aiQueue } from "../../jobs/queue";

export const registerQuizHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  // ── START QUIZ ──
  socket.on("quiz:start", async (data: { sessionId: string }) => {
    try {
      const { sessionId } = data;

      const [quiz] = await db
        .select()
        .from(quizzes)
        .where(eq(quizzes.sessionId, sessionId))
        .limit(1);

      if (!quiz) {
        socket.emit("quiz:error", {
          message: "No quiz found for this session",
        });
        return;
      }

      const questions = await db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quiz.id))
        .orderBy(quizQuestions.order);

      // broadcast quiz to everyone in session
      io.to(sessionId).emit("quiz:started", {
        quizId: quiz.id,
        questions: questions.map((q) => ({
          id: q.id,
          question: q.question,
          options: q.options,
          order: q.order,
          // never send correctAnswer to clients
        })),
      });

      console.log(`📝 Quiz started in session ${sessionId}`);
    } catch (err) {
      console.error("❌ Quiz start error:", err);
    }
  });

  // ── SUBMIT ANSWER ──
  socket.on(
    "quiz:answer",
    async (data: {
      quizId: string;
      questionId: string;
      answer: string;
      sessionId: string;
    }) => {
      try {
        const { quizId, questionId, answer, sessionId } = data;

        const [question] = await db
          .select()
          .from(quizQuestions)
          .where(eq(quizQuestions.id, questionId))
          .limit(1);

        if (!question) return;

        // Case-insensitive comparison to prevent marking correct answers wrong
        // due to minor capitalisation differences in AI-generated options
        const isCorrect =
          question.correctAnswer.trim().toLowerCase() ===
          answer.trim().toLowerCase();

        // upsert answer
        const existing = await db
          .select()
          .from(quizAnswers)
          .where(
            and(
              eq(quizAnswers.quizId, quizId),
              eq(quizAnswers.userId, userId),
              eq(quizAnswers.questionId, questionId),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(quizAnswers)
            .set({ answer, isCorrect })
            .where(eq(quizAnswers.id, existing[0].id));
        } else {
          await db.insert(quizAnswers).values({
            quizId,
            questionId,
            userId,
            answer,
            isCorrect,
          });
        }

        // tell the user if they were correct
        socket.emit("quiz:answer:result", {
          questionId,
          isCorrect,
          correctAnswer: question.correctAnswer,
        });

        // broadcast answer count to session room
        const allAnswers = await db
          .select()
          .from(quizAnswers)
          .where(eq(quizAnswers.quizId, quizId));

        io.to(sessionId).emit("quiz:progress", {
          quizId,
          answeredCount: new Set(allAnswers.map((a) => a.userId)).size,
        });
      } catch (err) {
        console.error("❌ Quiz answer error:", err);
      }
    },
  );

  // ── GET RESULTS ──
  socket.on(
    "quiz:results",
    async (data: { quizId: string; sessionId: string }) => {
      try {
        const { quizId, sessionId } = data;

        const allAnswers = await db
          .select({
            answer: quizAnswers,
            userName: users.name,
            avatar: users.avatar,
          })
          .from(quizAnswers)
          .innerJoin(users, eq(quizAnswers.userId, users.id))
          .where(eq(quizAnswers.quizId, quizId));

        const questions = await db
          .select()
          .from(quizQuestions)
          .where(eq(quizQuestions.quizId, quizId));

        const scoreMap: Record<
          string,
          {
            name: string;
            avatar: string | null;
            correct: number;
            total: number;
          }
        > = {};

        allAnswers.forEach(({ answer, userName, avatar }) => {
          if (!scoreMap[answer.userId]) {
            scoreMap[answer.userId] = {
              name: userName,
              avatar,
              correct: 0,
              total: 0,
            };
          }
          scoreMap[answer.userId].total++;
          if (answer.isCorrect) scoreMap[answer.userId].correct++;
        });

        const scores = Object.entries(scoreMap).map(([uid, data]) => ({
          userId: uid,
          ...data,
          percentage: Math.round((data.correct / data.total) * 100),
        }));

        io.to(sessionId).emit("quiz:results", {
          quizId,
          totalQuestions: questions.length,
          scores,
        });
      } catch (err) {
        console.error("❌ Quiz results error:", err);
      }
    },
  );
};
