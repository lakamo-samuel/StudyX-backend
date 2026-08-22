import { eq, and } from "drizzle-orm";
import { db } from "../../config/db";
import { groups, groupMembers } from "../../db/schema/groups";
import { users } from "../../db/schema/users";
import { notifications } from "../../db/schema/notifications";
import { assertMemberCapForGroup } from "../billing/entitlements";
import { AppError } from "../../middleware/error.middleware";
import type {
  CreateGroupInput,
  UpdateGroupInput,
  InviteMemberInput,
  ChangeMemberRoleInput,
} from "./groups.schema";

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
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "approved")));

  // Fetch member counts for all groups in one query
  const groupIds = members.map(m => m.group.id);
  const counts = groupIds.length > 0
    ? await db
        .select({ groupId: groupMembers.groupId, id: groupMembers.id })
        .from(groupMembers)
        .where(and(
          eq(groupMembers.status, "approved"),
        ))
    : [];

  const countMap = counts.reduce<Record<string, number>>((acc, row) => {
    if (groupIds.includes(row.groupId)) {
      acc[row.groupId] = (acc[row.groupId] ?? 0) + 1;
    }
    return acc;
  }, {});

  return members.map((m) => ({
    ...m.group,
    role: m.role,
    memberCount: countMap[m.group.id] ?? 1,
  }));
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
      status: groupMembers.status,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  return { 
    ...group, 
    members: members.filter(m => m.status === 'approved' || (m.status === 'invited' && group.adminId === userId)) 
  };
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

  if (existing) {
    if (existing.status === 'approved') throw new AppError("User is already a member", 409);
    if (existing.status === 'pending') throw new AppError("User already requested to join", 409);
    if (existing.status === 'invited') throw new AppError("User already has a pending invite", 409);
  }

  await assertMemberCapForGroup(groupId);

  // Add as invited — they must accept the invite
  await db.insert(groupMembers).values({
    groupId,
    userId: invitedUser.id,
    role: "member",
    status: "invited",
  });

  // Get inviting admin's name
  const [admin] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  // Send invitation notification to the invited user
  await db.insert(notifications).values({
    userId: invitedUser.id,
    type: "group",
    title: "Group Invitation",
    body: `${admin?.name ?? "An admin"} invited you to join "${group.name}".`,
    linkTo: `/groups/${groupId}`,
  });

  return { message: `Invitation sent to ${invitedUser.name}` };
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

// ── ACCEPT INVITE ──
export const acceptInvite = async (groupId: string, userId: string) => {
  const [pending] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "invited"),
      ),
    )
    .limit(1);

  if (!pending) throw new AppError("No pending invite found", 404);

  await assertMemberCapForGroup(groupId);

  await db
    .update(groupMembers)
    .set({ status: "approved" })
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    );

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  // Notify admin that the invite was accepted
  if (group && user) {
    await db.insert(notifications).values({
      userId: group.adminId,
      type: "group",
      title: "Invite Accepted",
      body: `${user.name} accepted your invitation to join "${group.name}".`,
      linkTo: `/groups/${groupId}`,
    });
  }

  return { message: "You have joined the group!", groupId };
};

// ── DECLINE INVITE ──
export const declineInvite = async (groupId: string, userId: string) => {
  const [pending] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "invited"),
      ),
    )
    .limit(1);

  if (!pending) throw new AppError("No pending invite found", 404);

  await db
    .delete(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    );

  return { message: "Invitation declined" };
};

// ── GET JOIN REQUESTS ──
export const getJoinRequests = async (groupId: string, userId: string) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== userId)
    throw new AppError("Only the admin can view join requests", 403);

  const requests = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      requestedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, "pending")
      ),
    );

  return requests;
};

// ── APPROVE JOIN REQUEST ──
export const approveJoinRequest = async (
  groupId: string,
  adminId: string,
  requesterId: string,
) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== adminId)
    throw new AppError("Only the admin can approve requests", 403);

  await assertMemberCapForGroup(groupId);

  const [updated] = await db
    .update(groupMembers)
    .set({ status: "approved" })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, requesterId),
        eq(groupMembers.status, "pending")
      ),
    )
    .returning();

  if (!updated) throw new AppError("Join request not found", 404);

  // Send notification to the user
  await db.insert(notifications).values({
    userId: requesterId,
    type: "group",
    title: "Join Request Approved",
    body: `Your request to join "${group.name}" has been approved!`,
    linkTo: `/groups/${groupId}`,
  });

  return { message: "Join request approved" };
};

// ── REJECT JOIN REQUEST ──
export const rejectJoinRequest = async (
  groupId: string,
  adminId: string,
  requesterId: string,
) => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== adminId)
    throw new AppError("Only the admin can reject requests", 403);

  const [deleted] = await db
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, requesterId),
        eq(groupMembers.status, "pending")
      ),
    )
    .returning();

  if (!deleted) throw new AppError("Join request not found", 404);

  // Optional: Send rejection notification
  await db.insert(notifications).values({
    userId: requesterId,
    type: "system",
    title: "Join Request Declined",
    body: `Your request to join "${group.name}" was declined.`,
  });

  return { message: "Join request rejected" };
};

// ── SCHEDULE SUGGESTIONS (no-cost overlap from availability) ──
export const getScheduleSuggestions = async (groupId: string, userId: string) => {
  const [member] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .limit(1);

  if (!member) throw new AppError("Group not found or access denied", 404);

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      availability: users.availability,
      status: groupMembers.status,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "approved")),
    );

  const totalMembers = members.length;
  if (totalMembers === 0) {
    return {
      groupId,
      totalMembers: 0,
      suggestions: [],
      message: "No approved members found yet.",
    };
  }

  const slotCounts = new Map<
    string,
    { slot: string; members: string[]; memberIds: string[] }
  >();

  for (const m of members) {
    const slots = Array.isArray(m.availability) ? m.availability : [];

    for (const rawSlot of slots) {
      const slot = String(rawSlot || "").trim();
      if (!slot) continue;

      const current = slotCounts.get(slot);
      if (current) {
        current.members.push(m.name);
        current.memberIds.push(m.id);
      } else {
        slotCounts.set(slot, {
          slot,
          members: [m.name],
          memberIds: [m.id],
        });
      }
    }
  }

  const suggestions = [...slotCounts.values()]
    .map((entry) => ({
      slot: entry.slot,
      overlapCount: entry.members.length,
      overlapRatio: Number((entry.members.length / totalMembers).toFixed(2)),
      members: entry.members,
      memberIds: entry.memberIds,
    }))
    .sort((a, b) => b.overlapCount - a.overlapCount)
    .slice(0, 10);

  return {
    groupId,
    totalMembers,
    suggestions,
    message:
      suggestions.length > 0
        ? "Top overlap suggestions generated from member availability."
        : "No shared availability data found yet. Ask members to update onboarding availability.",
  };
};
