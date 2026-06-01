import { eq, and } from "drizzle-orm";
import { db } from "../../config/db";
import { groups, groupMembers } from "../../db/schema/groups";
import { users } from "../../db/schema/users";
import { AppError } from "../../middleware/error.middleware";
import type {
  CreateGroupInput,
  UpdateGroupInput,
  InviteMemberInput,
  ChangeMemberRoleInput,
} from "../groups/groups.schema";

// ── CREATE GROUP ──
export const createGroup = async (userId: string, input: CreateGroupInput) => {
  const [group] = await db
    .insert(groups)
    .values({ ...input, adminId: userId })
    .returning();

  await db.insert(groupMembers).values({
    groupId: group.id,
    userId,
    role: "admin",
  });

  return group;
};

// ── GET USER GROUPS ──
export const getUserGroups = async (userId: string) => {
  const members = await db
    .select({
      group: groups,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId));

  return members.map((m) => ({ ...m.group, role: m.role }));
};

// ── GET SINGLE GROUP ──
export const getGroup = async (groupId: string, userId: string) => {
  const [member] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .limit(1);

  if (!member) throw new AppError("Group not found or access denied", 404);

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  return { ...group, members };
};

// ── UPDATE GROUP ──
export const updateGroup = async (
  groupId: string,
  userId: string,
  input: UpdateGroupInput,
) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== userId)
    throw new AppError("Only the admin can update this group", 403);

  const [updated] = await db
    .update(groups)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(groups.id, groupId))
    .returning();

  return updated;
};

// ── INVITE MEMBER ──
export const inviteMember = async (
  groupId: string,
  userId: string,
  input: InviteMemberInput,
) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== userId)
    throw new AppError("Only the admin can invite members", 403);

  const [invitedUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!invitedUser) throw new AppError("No user found with that email", 404);

  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, invitedUser.id),
      ),
    )
    .limit(1);

  if (existing) throw new AppError("User is already a member", 409);

  await db.insert(groupMembers).values({
    groupId,
    userId: invitedUser.id,
    role: "member",
  });

  return { message: `${invitedUser.name} added to the group` };
};

// ── REMOVE MEMBER ──
export const removeMember = async (
  groupId: string,
  adminId: string,
  memberId: string,
) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== adminId)
    throw new AppError("Only the admin can remove members", 403);
  if (memberId === adminId)
    throw new AppError("Admin cannot remove themselves", 400);

  await db
    .delete(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)),
    );

  return { message: "Member removed successfully" };
};

// ── CHANGE MEMBER ROLE ──
export const changeMemberRole = async (
  groupId: string,
  adminId: string,
  memberId: string,
  input: ChangeMemberRoleInput,
) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== adminId)
    throw new AppError("Only the admin can change roles", 403);

  await db
    .update(groupMembers)
    .set({ role: input.role })
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)),
    );

  return { message: "Member role updated successfully" };
};

// ── LEAVE GROUP ──
export const leaveGroup = async (groupId: string, userId: string) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId === userId)
    throw new AppError(
      "Admin cannot leave. Transfer admin role first or delete the group",
      400,
    );

  await db
    .delete(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    );

  return { message: "You have left the group" };
};

// ── DELETE GROUP ──
export const deleteGroup = async (groupId: string, userId: string) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== userId)
    throw new AppError("Only the admin can delete this group", 403);

  await db.delete(groups).where(eq(groups.id, groupId));

  return { message: "Group deleted successfully" };
};
