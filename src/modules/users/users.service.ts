import { eq, and, desc } from "drizzle-orm"
import { db } from "../../config/db"
import { users } from "../../db/schema/users"
import { quizAnswers, quizQuestions } from "../../db/schema/quizzes"
import { AppError } from "../../middleware/error.middleware"
import { ChangePasswordInput, UpdateProfileInput } from "../user.schema"
import bcrypt from "bcryptjs";
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
            goals: users.goals,
            availability: users.availability,
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
      id:           users.id,
      name:         users.name,
      email:        users.email,
      university:   users.university,
      course:       users.course,
      year:         users.year,
      avatar:       users.avatar,
      streak:       users.streak,
      goals:        users.goals,
      availability: users.availability,
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

  // ── 1. Quiz answers for accuracy + performance charts ──
  const allAnswers = await db
    .select({
      isCorrect: quizAnswers.isCorrect,
      quizId: quizAnswers.quizId,
      createdAt: quizAnswers.createdAt,
    })
    .from(quizAnswers)
    .where(eq(quizAnswers.userId, userId))
    .orderBy(quizAnswers.createdAt)

  const correctCount = allAnswers.filter(a => a.isCorrect).length
  const totalAnswers = allAnswers.length
  const incorrectCount = totalAnswers - correctCount
  const averageScore = totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0

  const accuracyData = totalAnswers > 0
    ? [{ name: 'Correct', value: correctCount }, { name: 'Incorrect', value: incorrectCount }]
    : [{ name: 'No Data Yet', value: 1 }]

  // Group by quiz and preserve chronological order using first answer timestamp per quiz
  const quizScoresMap = new Map<string, { correct: number; total: number; firstAnsweredAt: Date }>()
  allAnswers.forEach(a => {
    if (!quizScoresMap.has(a.quizId)) {
      quizScoresMap.set(a.quizId, { correct: 0, total: 0, firstAnsweredAt: a.createdAt })
    }
    const entry = quizScoresMap.get(a.quizId)!
    entry.total++
    if (a.isCorrect) entry.correct++
  })

  const sortedQuizEntries = Array.from(quizScoresMap.entries())
    .sort((a, b) => a[1].firstAnsweredAt.getTime() - b[1].firstAnsweredAt.getTime())
    .slice(-6) // last 6 quizzes chronologically

  const performanceData = sortedQuizEntries.length > 0
    ? sortedQuizEntries.map(([, data], idx) => ({
        name: `Quiz ${idx + 1}`,
        score: Math.round((data.correct / data.total) * 100),
      }))
    : [{ name: 'No Quizzes', score: 0 }]

  // ── 2. Weak spots from recent incorrect answers ──
  const recentMisses = await db
    .select({ topic: quizQuestions.question, description: quizAnswers.answer })
    .from(quizAnswers)
    .innerJoin(quizQuestions, eq(quizAnswers.questionId, quizQuestions.id))
    .where(and(eq(quizAnswers.userId, userId), eq(quizAnswers.isCorrect, false)))
    .orderBy(desc(quizAnswers.createdAt))
    .limit(3)

  const weakSpots = recentMisses.length > 0
    ? recentMisses.map(m => ({
        topic: m.topic.length > 50 ? m.topic.substring(0, 47) + '...' : m.topic,
        description: `You answered: ${m.description}`,
      }))
    : [{ topic: 'General Review', description: 'No recent incorrect answers!' }]

  // ── 3. Session activity for deep work hours + activity chart ──
  const { sessions } = await import('../../db/schema/sessions')
  const { groupMembers } = await import('../../db/schema/groups')

  // Start of current calendar week (Monday)
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - ((dayOfWeek + 6) % 7)) // Monday
  startOfWeek.setHours(0, 0, 0, 0)

  // All ended sessions the user was part of, within the last 30 days (enough for streak calc)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const pastSessions = await db
    .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .innerJoin(groupMembers, eq(sessions.groupId, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(sessions.status, 'ended')))

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const activityMap: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 }
  let deepWorkHours = 0

  pastSessions.forEach(s => {
    if (!s.startedAt || !s.endedAt) return
    const durationHours = (s.endedAt.getTime() - s.startedAt.getTime()) / (1000 * 60 * 60)
    if (s.startedAt >= startOfWeek) {
      const day = daysOfWeek[s.startedAt.getDay()]
      activityMap[day] += durationHours
      deepWorkHours += durationHours
    }
  })

  const activityData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
    day,
    hours: parseFloat(activityMap[day].toFixed(1)),
  }))

  // ── 4. Real streak: count consecutive days with at least one session ending ──
  // Build a set of unique dates (YYYY-MM-DD) where user had a session
  const sessionDates = new Set<string>()
  pastSessions.forEach(s => {
    if (s.endedAt) {
      sessionDates.add(s.endedAt.toISOString().split('T')[0])
    }
  })

  // Walk backwards from today counting consecutive days
  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // If no session today, start checking from yesterday
  const todayStr = today.toISOString().split('T')[0]
  const checkFrom = sessionDates.has(todayStr) ? 0 : 1

  for (let i = checkFrom; i < 60; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    if (sessionDates.has(dateStr)) {
      streak++
    } else {
      break
    }
  }

  return {
    weakSpots,
    performanceData,
    activityData,
    accuracyData,
    averageScore,
    deepWorkHours: parseFloat(deepWorkHours.toFixed(1)),
    currentStreak: streak,
  }
}