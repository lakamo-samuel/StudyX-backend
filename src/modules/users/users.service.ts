import { eq, and, desc } from "drizzle-orm"
import { db } from "../../config/db"
import { users } from "../../db/schema/users"
import { quizAnswers, quizQuestions } from "../../db/schema/quizzes"
import { AppError } from "../../middleware/error.middleware"
import { ChangePasswordInput, UpdateProfileInput } from "../user.schema"
import bcrypt from "bcryptjs";
import constants from "constants"
import { env } from "../../config/env"

// ── GET PROFILE ──
export const getProfile = async (userId: string) => {
    const [user] = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            university: users.university,
            course: users.course,
            year: users.year,
            avatar: users.avatar,
            streak: users.streak,
            createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if(!user) throw new AppError('User not found', 404)
 
    return  user
}



// ── UPDATE PROFILE ──
export const updateProfile = async (userId: string, input: UpdateProfileInput) => {
  const [updated] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({
      id:         users.id,
      name:       users.name,
      email:      users.email,
      university: users.university,
      course:     users.course,
      year:       users.year,
      avatar:     users.avatar,
      streak:     users.streak,
    })

  if (!updated) throw new AppError('User not found', 404)

  return updated
}

// ── CHANGE PASSWORD ──
export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new AppError('User not found', 404)

  const isMatch = await bcrypt.compare(input.currentPassword, user.password)

  if (!isMatch) throw new AppError('Current password is incorrect', 400)

  const hashed = await bcrypt.hash(input.newPassword, 12)

  await db
    .update(users)
    .set({ password: hashed, updatedAt: new Date() })
    .where(eq(users.id, userId))

  return { message: 'Password changed successfully' }
}

export const getAvatarUploadSignature = async () => {
    const cloudinary = (await import('../../config/cloudinary')).default
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder: 'Vyrdly/avatars' },
        env.CLOUDINARY_API_SECRET  as string
    )


    return {
        timestamp,
        signature,
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        folder: 'Vyrdly/avatars',
    }
}

// ── DELETE ACCOUNT ──
export const deleteAccount = async (userId: string) => {
  await db.delete(users).where(eq(users.id, userId))
  return { message: 'Account deleted successfully' }
}

// ── GET ANALYTICS ──
export const getAnalytics = async (userId: string) => {
  const [user] = await db.select({ streak: users.streak }).from(users).where(eq(users.id, userId)).limit(1);

  const recentMisses = await db
    .select({
      topic: quizQuestions.question,
      description: quizAnswers.answer,
    })
    .from(quizAnswers)
    .innerJoin(quizQuestions, eq(quizAnswers.questionId, quizQuestions.id))
    .where(and(eq(quizAnswers.userId, userId), eq(quizAnswers.isCorrect, false)))
    .orderBy(desc(quizAnswers.createdAt))
    .limit(3)

  const weakSpots = recentMisses.length > 0 ? recentMisses.map(m => ({
    topic: m.topic.length > 50 ? m.topic.substring(0, 47) + '...' : m.topic,
    description: `You answered: ${m.description}`,
  })) : [
    { topic: "General Review", description: "You have no recent incorrect answers!" }
  ]

  // Real data for pie chart and performance
  const allAnswers = await db
    .select({ isCorrect: quizAnswers.isCorrect, quizId: quizAnswers.quizId, createdAt: quizAnswers.createdAt })
    .from(quizAnswers)
    .where(eq(quizAnswers.userId, userId))
    .orderBy(quizAnswers.createdAt)
  
  const correctCount = allAnswers.filter(a => a.isCorrect).length
  const totalAnswers = allAnswers.length
  const incorrectCount = totalAnswers - correctCount
  const averageScore = totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0

  const accuracyData = totalAnswers > 0 ? [
    { name: 'Correct', value: correctCount },
    { name: 'Incorrect', value: incorrectCount }
  ] : [
    { name: 'No Data Yet', value: 1 }
  ]

  // Group performance by Quiz 
  const quizScoresMap: Record<string, { correct: number, total: number }> = {}
  allAnswers.forEach(a => {
    if (!quizScoresMap[a.quizId]) quizScoresMap[a.quizId] = { correct: 0, total: 0 }
    quizScoresMap[a.quizId].total++
    if (a.isCorrect) quizScoresMap[a.quizId].correct++
  })

  const quizIds = Object.keys(quizScoresMap).slice(-6); // last 6 quizzes
  const performanceData = quizIds.length > 0 ? quizIds.map((qid, idx) => ({
    name: `Quiz ${idx + 1}`,
    score: Math.round((quizScoresMap[qid].correct / quizScoresMap[qid].total) * 100)
  })) : [
    { name: 'No Quizzes', score: 0 }
  ];

  // Activity Data: fetch all ended sessions in the user's groups
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { sessions } = await import("../../db/schema/sessions");
  const { groupMembers } = await import("../../db/schema/groups");

  const pastSessions = await db
    .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .innerJoin(groupMembers, eq(sessions.groupId, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(sessions.status, 'ended')
      )
    );

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const activityMap: Record<string, number> = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0 };
  let deepWorkHours = 0;

  pastSessions.forEach(s => {
    if (s.startedAt && s.endedAt) {
      const durationMs = s.endedAt.getTime() - s.startedAt.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      
      // If session was within the last 7 days, add to activityData
      if (s.startedAt >= sevenDaysAgo) {
        const day = daysOfWeek[s.startedAt.getDay()];
        activityMap[day] += durationHours;
        deepWorkHours += durationHours;
      }
    }
  });

  const activityData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
    day,
    hours: parseFloat(activityMap[day].toFixed(1))
  }));

  return { 
    weakSpots, 
    performanceData, 
    activityData, 
    accuracyData,
    averageScore,
    deepWorkHours: parseFloat(deepWorkHours.toFixed(1)),
    currentStreak: user?.streak || 0
  }
}