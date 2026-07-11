import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { messages } from "../../db/schema/messages";
import { sessions } from "../../db/schema/sessions";
import { users } from "../../db/schema/users";
import { groupMembers } from "../../db/schema/groups";
import { AppError } from "../../middleware/error.middleware";
import { and } from "drizzle-orm";


// helper: assert session access
const assertSessionAccess = async (sessionId: string, userId: string) => {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

    if (!session) throw new AppError('Session not found', 404)
    
    const [member] = await db.select().from(groupMembers).where(and(
        eq(groupMembers.groupId, session.groupId),
        eq(groupMembers.userId, userId)
    )).limit(1)

    if (!member) throw new AppError('Access denied', 403)
    
    return session
}


// --GET MESSAGE HISTORY --

export const getMessages = async (sessionId: string, userId: string) => {
    await assertSessionAccess(sessionId, userId)

    return db.select({
        id: messages.id,
        text: messages.text,
        createdAt: messages.createdAt,
        user: {
            id: users.id,
            name: users.name,
            avatar: users.avatar,
        }
    }).from(messages).innerJoin(users, eq(messages.userId, users.id)).where(eq(messages.sessionId, sessionId)).orderBy(messages.createdAt)
}

export const saveMessage = async(
    sessionId: string,
    userId: string,
    text: string
) => {
    await assertSessionAccess(sessionId, userId)
    const [message] = await db.insert(messages).values({ sessionId, userId, text }).returning()
    
    const [withUser] = await db.select({
        id: messages.id,
        text: messages.text,
        createdAt: messages.createdAt,
        user: {
            id: users.id,
            name: users.name,
            avatar: users.avatar
        },
    }).from(messages).innerJoin(users, eq(messages.userId, users.id)).where(eq(messages.id, message.id)).limit(1)
    
    return withUser
}