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

// ── helper: check user is group member ──
const assertGroupMember = async (groupId: string, userId: string) => {
  const [member] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .limit(1);
  if (!member) throw new AppError("You are not a member of this group", 403);
  return member;
};

// ── helper: check user can access session ──
const assertSessionAccess = async (sessionId: string, userId: string) => {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) throw new AppError("Session not found", 404);
  await assertGroupMember(session.groupId, userId);
  return session;
};

// ── CREATE SESSION ──
export const createSession = async (
  userId: string,
  input: CreateSessionInput,
) => {
  await assertGroupMember(input.groupId, userId);

  const [session] = await db
    .insert(sessions)
    .values({
      groupId: input.groupId,
      title: input.title,
      goal: input.goal,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      status: "scheduled",
      createdBy: userId,
    })
    .returning();

  return session;
};

// ── GET SESSIONS BY GROUP ──
export const getSessionsByGroup = async (groupId: string, userId: string) => {
  await assertGroupMember(groupId, userId);

  return db
    .select()
    .from(sessions)
    .where(eq(sessions.groupId, groupId))
    .orderBy(sessions.createdAt);
};

// ── GET ALL USER SESSIONS (across all groups) ──
export const getAllUserSessions = async (userId: string) => {
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  const groupIds = memberships.map((m) => m.groupId);

  if (groupIds.length === 0) return [];

  const allSessions = await Promise.all(
    groupIds.map((groupId) =>
      db.select().from(sessions).where(eq(sessions.groupId, groupId)),
    ),
  );

  return allSessions
    .flat()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
};

// ── GET SINGLE SESSION ──
export const getSession = async (sessionId: string, userId: string) => {
  const session = await assertSessionAccess(sessionId, userId);

  const agenda = await db
    .select()
    .from(sessionAgenda)
    .where(eq(sessionAgenda.sessionId, sessionId))
    .orderBy(sessionAgenda.order);

  return { ...session, agenda };
};

// ── UPDATE SESSION ──
export const updateSession = async (
  sessionId: string,
  userId: string,
  input: UpdateSessionInput,
) => {
  const session = await assertSessionAccess(sessionId, userId);

  if (session.status === "ended") {
    throw new AppError("Cannot update an ended session", 400);
  }

  const [updated] = await db
    .update(sessions)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();

  return updated;
};

// ── UPDATE SESSION STATUS ──
export const updateSessionStatus = async (
  sessionId: string,
  userId: string,
  input: UpdateSessionStatusInput,
) => {
  const session = await assertSessionAccess(sessionId, userId);

  // enforce valid status transitions
  const validTransitions: Record<string, string[]> = {
    scheduled: ["ready"],
    ready: ["active", "scheduled"],
    active: ["ended"],
    ended: [],
  };

  if (!validTransitions[session.status].includes(input.status)) {
    throw new AppError(
      `Cannot transition from ${session.status} to ${input.status}`,
      400,
    );
  }

  const updates: Partial<typeof session> = {
    status: input.status,
    updatedAt: new Date(),
  };

  if (input.status === "active") updates.startedAt = new Date();
  if (input.status === "ended") updates.endedAt = new Date();

  const [updated] = await db
    .update(sessions)
    .set(updates)
    .where(eq(sessions.id, sessionId))
    .returning();

  return updated;
};

// ── DELETE SESSION ──
export const deleteSession = async (sessionId: string, userId: string) => {
  const session = await assertSessionAccess(sessionId, userId);

  if (session.status === "active") {
    throw new AppError("Cannot delete an active session", 400);
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  return { message: "Session deleted successfully" };
};

// ── ADD AGENDA ITEM ──
export const addAgendaItem = async (
  sessionId: string,
  userId: string,
  input: CreateAgendaItemInput,
) => {
  await assertSessionAccess(sessionId, userId);

  const [item] = await db
    .insert(sessionAgenda)
    .values({ sessionId, ...input })
    .returning();

  return item;
};

// ── UPDATE AGENDA ITEM ──
export const updateAgendaItem = async (
  itemId: string,
  userId: string,
  input: UpdateAgendaItemInput,
) => {
  const [item] = await db
    .select()
    .from(sessionAgenda)
    .where(eq(sessionAgenda.id, itemId))
    .limit(1);

  if (!item) throw new AppError("Agenda item not found", 404);

  await assertSessionAccess(item.sessionId, userId);

  const [updated] = await db
    .update(sessionAgenda)
    .set(input)
    .where(eq(sessionAgenda.id, itemId))
    .returning();

  return updated;
};

// ── DELETE AGENDA ITEM ──
export const deleteAgendaItem = async (itemId: string, userId: string) => {
  const [item] = await db
    .select()
    .from(sessionAgenda)
    .where(eq(sessionAgenda.id, itemId))
    .limit(1);

  if (!item) throw new AppError("Agenda item not found", 404);

  await assertSessionAccess(item.sessionId, userId);

  await db.delete(sessionAgenda).where(eq(sessionAgenda.id, itemId));

  return { message: "Agenda item deleted" };
};
