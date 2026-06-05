import { eq, ilike, or, and } from "drizzle-orm";
import { db } from "../../config/db";
import { groups, groupMembers } from "../../db/schema/groups";
import { sessions } from "../../db/schema/sessions";
import { users } from "../../db/schema/users";

// ── SEARCH PUBLIC GROUPS ──
export const searchGroups = async (
  userId: string,
  query?: string,
  filter?: string,
) => {
  // get groups user already belongs to
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  const joinedGroupIds = memberships.map((m) => m.groupId);

  // fetch all public groups
  let allGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.visibility, "public"));

  // exclude groups user already belongs to
  allGroups = allGroups.filter((g) => !joinedGroupIds.includes(g.id));

  // apply search query
  if (query && query.trim().length > 0) {
    const q = query.toLowerCase();
    allGroups = allGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.subject.toLowerCase().includes(q) ||
        g.goal.toLowerCase().includes(q),
    );
  }

  // get member counts and active session status for each group
  const enriched = await Promise.all(
    allGroups.map(async (group) => {
      const members = await db
        .select({ id: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id));

      const activeSessions = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(eq(sessions.groupId, group.id), eq(sessions.status, "active")),
        );

      const upcomingSessions = await db
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.groupId, group.id), eq(sessions.status, "scheduled")),
        )
        .limit(1);

      return {
        ...group,
        memberCount: members.length,
        isActive: activeSessions.length > 0,
        nextSession: upcomingSessions[0] || null,
      };
    }),
  );

  // apply filter
  if (filter === "active") {
    return enriched.filter((g) => g.isActive);
  }

  return enriched;
};

// ── GET PUBLIC GROUP DETAIL ──
export const getPublicGroup = async (groupId: string) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.visibility, "public")))
    .limit(1);

  if (!group) return null;

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  return { ...group, members, memberCount: members.length };
};

// ── JOIN PUBLIC GROUP ──
export const joinPublicGroup = async (groupId: string, userId: string) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.visibility, "public")))
    .limit(1);

  if (!group) {
    const { AppError } = await import("../../middleware/error.middleware");
    throw new AppError("Group not found or is not public", 404);
  }

  // check if already a member
  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .limit(1);

  if (existing) {
    const { AppError } = await import("../../middleware/error.middleware");
    throw new AppError("You are already a member of this group", 409);
  }

  await db.insert(groupMembers).values({
    groupId,
    userId,
    role: "member",
  });

  return { message: "Successfully joined the group" };
};
