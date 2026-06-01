import { eq, and } from "drizzle-orm";
import { db } from "../../config/db";
import { sessions, sessionAgenda } from "../../db/schema/sessions";
import { groupMembers } from "../../db/schema/groups";
import { AppError } from "../../middleware/error.middleware";
import type {
  CreateSessionInput,
  UpdateSessionInput,
  UpdateSessionStatusInput,
  CreateAgendaItemInput,
  UpdateAgendaItemInput,
} from "./sessions.schema";

// -- helper: check user is group member --

const assertGroupMember = async (groupId: string, userId: string) => {
    const [member] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1)

    if (!member) throw new AppError('You are not a member of this group', 403);

    return member

}


// --helper: check user can accesss session --
const assertSessionAccess = async (sessionId: string, userId: string) => {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
    
    if(!session) throw new AppError('Session not found', 404)
await assertGroupMember(session.groupId, userId)
}

// -- CREATE SESSION __

export const createSessiom = async (userId: string, input: CreateSessionInput) => {
    await assertGroupMember(input.groupId, userId)

    const [session] = await db.insert(sessions).values({
        groupId: input.groupId,
        title: input.title,
        goal: input.goal,
        scheduledDate: input.scheduledDate,
        scheduledTime: input.scheduledTime,
        status: 'scheduled',
        createdBy: userId,
    }).returning()

    return session
}

// -- GET SESSIONS BY GROUPS --

export const getSessionsByGroup = async (groupId: string, userId: string) => {
    await assertGroupMember(groupId, userId)

    return db.select().from(sessions).where(eq(sessions.groupId, groupId)).orderBy(sessions.createdAt)
}