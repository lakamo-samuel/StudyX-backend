import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../config/db";
import { groups, groupMembers, groupInviteLinks } from "../../db/schema/groups";
import { users } from "../../db/schema/users";
import { notifications } from "../../db/schema/notifications";
import { assertMemberCapForGroup } from "../billing/entitlements";
import { AppError } from "../../middleware/error.middleware";

// ── helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex"); // 48 hex chars
}

async function assertAdmin(groupId: string, userId: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) throw new AppError("Group not found", 404);
  if (group.adminId !== userId) throw new AppError("Only group admins can manage invite links", 403);
  return group;
}

// ── service ───────────────────────────────────────────────────────────────────

/**
 * Create a new shareable invite link for a group.
 * Optional: maxUses (null = unlimited), expiresInDays (null = never).
 */
export const createInviteLink = async (
  groupId: string,
  userId: string,
  opts: { maxUses?: number | null; expiresInDays?: number | null } = {},
) => {
  const group = await assertAdmin(groupId, userId);

  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86_400_000)
    : null;

  const [link] = await db
    .insert(groupInviteLinks)
    .values({
      groupId,
      createdBy: userId,
      token: generateToken(),
      maxUses: opts.maxUses ?? null,
      expiresAt,
    })
    .returning();

  return { ...link, groupName: group.name };
};

/**
 * List all active invite links for a group (admin only).
 */
export const getInviteLinks = async (groupId: string, userId: string) => {
  await assertAdmin(groupId, userId);

  const links = await db
    .select()
    .from(groupInviteLinks)
    .where(and(eq(groupInviteLinks.groupId, groupId), eq(groupInviteLinks.isActive, true)));

  return links;
};

/**
 * Revoke (deactivate) an invite link.
 */
export const revokeInviteLink = async (
  groupId: string,
  linkId: string,
  userId: string,
) => {
  await assertAdmin(groupId, userId);

  const [updated] = await db
    .update(groupInviteLinks)
    .set({ isActive: false })
    .where(and(eq(groupInviteLinks.id, linkId), eq(groupInviteLinks.groupId, groupId)))
    .returning();

  if (!updated) throw new AppError("Invite link not found", 404);
  return { message: "Invite link revoked" };
};

/**
 * Preview a link by token — returns group name without joining.
 * Used on the /join/:token landing page before the user confirms.
 */
export const getInviteLinkPreview = async (token: string) => {
  const [link] = await db
    .select()
    .from(groupInviteLinks)
    .where(eq(groupInviteLinks.token, token))
    .limit(1);

  if (!link || !link.isActive) throw new AppError("Invite link is invalid or has been revoked", 404);
  if (link.expiresAt && link.expiresAt < new Date()) throw new AppError("Invite link has expired", 410);
  if (link.maxUses !== null && link.useCount >= link.maxUses) throw new AppError("Invite link has reached its use limit", 410);

  const [group] = await db.select({ id: groups.id, name: groups.name, subject: groups.subject }).from(groups).where(eq(groups.id, link.groupId)).limit(1);
  if (!group) throw new AppError("Group not found", 404);

  return { groupId: group.id, groupName: group.name, subject: group.subject, token };
};

/**
 * Accept an invite link — joins the authenticated user to the group.
 */
export const acceptInviteLink = async (token: string, userId: string) => {
  const [link] = await db
    .select()
    .from(groupInviteLinks)
    .where(eq(groupInviteLinks.token, token))
    .limit(1);

  if (!link || !link.isActive) throw new AppError("Invite link is invalid or has been revoked", 404);
  if (link.expiresAt && link.expiresAt < new Date()) throw new AppError("Invite link has expired", 410);
  if (link.maxUses !== null && link.useCount >= link.maxUses) throw new AppError("Invite link has reached its use limit", 410);

  const groupId = link.groupId;

  // Check user isn't already a member
  const [existing] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);

  if (existing?.status === "approved") throw new AppError("You are already a member of this group", 409);

  // Enforce plan member cap
  await assertMemberCapForGroup(groupId);

  if (existing) {
    // Upgrade a pending/invited record to approved
    await db
      .update(groupMembers)
      .set({ status: "approved" })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  } else {
    await db.insert(groupMembers).values({ groupId, userId, role: "member", status: "approved" });
  }

  // Increment use count
  await db
    .update(groupInviteLinks)
    .set({ useCount: link.useCount + 1 })
    .where(eq(groupInviteLinks.id, link.id));

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const [user]  = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  // Notify admin
  if (group && user) {
    await db.insert(notifications).values({
      userId: group.adminId,
      type: "group",
      title: "New Member Joined",
      body: `${user.name} joined "${group.name}" via invite link.`,
      linkTo: `/groups/${groupId}`,
    });
  }

  return { message: "You have joined the group!", groupId };
};
