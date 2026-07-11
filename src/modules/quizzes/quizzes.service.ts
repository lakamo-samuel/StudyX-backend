import { eq, and, desc } from "drizzle-orm";
import { db } from "../../config/db";
import { quizzes, quizQuestions, quizAnswers } from "../../db/schema/quizzes";
import { groupMembers } from "../../db/schema/groups";
import { sessions } from "../../db/schema/sessions";
import { users } from "../../db/schema/users";
import { AppError } from "../../middleware/error.middleware";
import type { CreateQuizInput, SubmitAnswerInput } from "./quizzes.schema";

// ── helper: assert session access ──
const assertSessionAccess = async (sessionId: string, userId: string) => {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) throw new AppError("Session not found", 404);

  const [member] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, session.groupId),
        eq(groupMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!member) throw new AppError("Access denied", 403);
  return session;
};

// ── CREATE QUIZ ──
export const createQuiz = async (userId: string, input: CreateQuizInput) => {
  await assertSessionAccess(input.sessionId, userId);

  const [quiz] = await db
    .insert(quizzes)
    .values({
      sessionId: input.sessionId,
      groupId: input.groupId,
    })
    .returning();

  const insertedQuestions = await Promise.all(
    input.questions.map((q, index) =>
      db
        .insert(quizQuestions)
        .values({
          quizId: quiz.id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          order: q.order ?? index,
        })
        .returning(),
    ),
  );

  return {
    ...quiz,
    questions: insertedQuestions.map((q) => q[0]),
  };
};

// ── GET QUIZ BY SESSION ──
export const getQuizBySession = async (sessionId: string, userId: string) => {
  await assertSessionAccess(sessionId, userId);

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.sessionId, sessionId))
    .orderBy(desc(quizzes.createdAt))
    .limit(1);

  if (!quiz) throw new AppError("No quiz found for this session", 404);

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(quizQuestions.order);

  // get user's existing answers
  const userAnswers = await db
    .select()
    .from(quizAnswers)
    .where(
      and(eq(quizAnswers.quizId, quiz.id), eq(quizAnswers.userId, userId)),
    );

  return {
    ...quiz,
    questions,
    userAnswers,
  };
};

// ── SUBMIT ANSWER ──
export const submitAnswer = async (
  quizId: string,
  userId: string,
  input: SubmitAnswerInput,
) => {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) throw new AppError("Quiz not found", 404);

  await assertSessionAccess(quiz.sessionId, userId);

  const [question] = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.id, input.questionId))
    .limit(1);

  if (!question) throw new AppError("Question not found", 404);

  const isCorrect = question.correctAnswer.trim() === input.answer.trim();

  // upsert — update if already answered, insert if not
  const existing = await db
    .select()
    .from(quizAnswers)
    .where(
      and(
        eq(quizAnswers.quizId, quizId),
        eq(quizAnswers.userId, userId),
        eq(quizAnswers.questionId, input.questionId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(quizAnswers)
      .set({ answer: input.answer, isCorrect })
      .where(eq(quizAnswers.id, existing[0].id))
      .returning();
    return updated;
  }

  const [answer] = await db
    .insert(quizAnswers)
    .values({
      quizId,
      questionId: input.questionId,
      userId,
      answer: input.answer,
      isCorrect,
    })
    .returning();

  return answer;
};

// ── GET QUIZ RESULTS ──
export const getQuizResults = async (quizId: string, userId: string) => {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) throw new AppError("Quiz not found", 404);

  await assertSessionAccess(quiz.sessionId, userId);

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.order);

  const allAnswers = await db
    .select({
      answer: quizAnswers,
      userName: users.name,
      userAvatar: users.avatar,
    })
    .from(quizAnswers)
    .innerJoin(users, eq(quizAnswers.userId, users.id))
    .where(eq(quizAnswers.quizId, quizId));

  // calculate scores per user
  const scoreMap: Record<
    string,
    { name: string; avatar: string | null; correct: number; total: number }
  > = {};

  allAnswers.forEach(({ answer, userName, userAvatar }) => {
    if (!scoreMap[answer.userId]) {
      scoreMap[answer.userId] = {
        name: userName,
        avatar: userAvatar,
        correct: 0,
        total: 0,
      };
    }
    scoreMap[answer.userId].total++;
    if (answer.isCorrect) scoreMap[answer.userId].correct++;
  });

  const scores = Object.entries(scoreMap).map(([userId, data]) => ({
    userId,
    ...data,
    percentage: Math.round((data.correct / data.total) * 100),
  }));

  // current user score
  const userAnswers = allAnswers
    .filter((a) => a.answer.userId === userId)
    .map((a) => a.answer);

  const userCorrect = userAnswers.filter((a) => a.isCorrect).length;

  return {
    quizId,
    totalQuestions: questions.length,
    questions,
    scores,
    userScore: {
      correct: userCorrect,
      total: questions.length,
      percentage: Math.round((userCorrect / questions.length) * 100),
    },
  };
};

// ── GET SESSION DEBRIEF ──
export const getSessionDebrief = async (sessionId: string, userId: string) => {
  await assertSessionAccess(sessionId, userId);

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) throw new AppError("Session not found", 404);
  if (session.status !== "ended")
    throw new AppError("Session has not ended yet", 400);

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.sessionId, sessionId))
    .orderBy(desc(quizzes.createdAt))
    .limit(1);

  if (!quiz) {
    return {
      session,
      quiz: null,
      results: null,
      userScore: null,
    };
  }

  const results = await getQuizResults(quiz.id, userId);

  let durationStr = "0 min";
  if (session.startedAt && session.endedAt) {
    const diffMs = session.endedAt.getTime() - session.startedAt.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) durationStr = `${diffMins} min`;
    else {
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      durationStr = `${hrs} hr ${mins > 0 ? mins + ' min' : ''}`.trim();
    }
  }

  const { groupMembers } = await import("../../db/schema/groups");
  const members = await db.select({ id: groupMembers.id }).from(groupMembers).where(eq(groupMembers.groupId, session.groupId));
  const participantCount = members.length;

  const enrichedSession = {
    ...session,
    duration: durationStr,
    participantCount: participantCount.toString()
  };

  return {
    session: enrichedSession,
    quiz,
    results,
  };
};
