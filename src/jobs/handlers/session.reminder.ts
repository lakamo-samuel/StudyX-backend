import { db } from "../../config/db";
import { sessions } from "../../db/schema/sessions";
import { groups, groupMembers } from "../../db/schema/groups";
import { notifications } from "../../db/schema/notifications";
import { users } from "../../db/schema/users";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "../../lib/email";
import { getIo } from "../../socket/socket-instance";

// ────────────────────────────────────────────────────────
//  SESSION REMINDER JOB
//  Runs exactly when a session's scheduled time arrives.
//  - Transitions status: scheduled → ready
//  - Creates in-app notifications for all group members
//  - Sends email notifications
//  - Broadcasts session:ready via socket so all online members see it instantly
// ────────────────────────────────────────────────────────
export const handleSessionReminder = async (job: {
  data: { sessionId: string };
}) => {
  const { sessionId } = job.data;

  console.log(`⏰ Session reminder triggered for: ${sessionId}`);

  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      console.log(`Session ${sessionId} not found — skipping reminder`);
      return;
    }

    // Only process if still scheduled — may have been started/cancelled already
    if (session.status !== "scheduled") {
      console.log(`Session ${sessionId} is ${session.status} — skipping reminder`);
      return;
    }

    // ── Transition to ready ──
    const [updated] = await db
      .update(sessions)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .returning();

    // ── Fetch group + all approved members with emails ──
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, session.groupId))
      .limit(1);

    const memberRows = await db
      .select({
        userId: groupMembers.userId,
        name: users.name,
        email: users.email,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(
        and(
          eq(groupMembers.groupId, session.groupId),
          eq(groupMembers.status, "approved"),
        ),
      );

    const groupName = group?.name ?? "your group";
    const sessionLink = `/session/${sessionId}`;

    // ── Create in-app notifications for every member ──
    if (memberRows.length > 0) {
      await db.insert(notifications).values(
        memberRows.map((m) => ({
          userId: m.userId,
          type: "session" as const,
          title: "Session is ready to join",
          body: `"${session.title}" in ${groupName} is now ready. Join now!`,
          linkTo: sessionLink,
        })),
      );
    }

    // ── Broadcast via socket so online members see it immediately ──
    const io = getIo();
    if (io && updated) {
      // Broadcast to the group room (all members who have joined presence)
      io.to(session.groupId).emit("session:ready", {
        session: updated,
        message: `"${session.title}" is ready to join!`,
      });
      // Also broadcast to the session room for anyone already on the session page
      io.to(sessionId).emit("session:started", { session: updated });
    }

    // ── Send email notifications (non-blocking — failures are logged not thrown) ──
    const emailPromises = memberRows.map(async (m) => {
      try {
        await sendEmail({
          to: m.email,
          subject: `Time to study — "${session.title}" is ready`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #28372c;">Your study session is ready 📚</h2>
              <p>Hey ${m.name.split(" ")[0]},</p>
              <p>Your session <strong>"${session.title}"</strong> in <strong>${groupName}</strong> is now ready to join.</p>
              ${session.goal ? `<p style="color: #52634c; font-style: italic;">${session.goal}</p>` : ""}
              <a href="${process.env.CLIENT_URL}${sessionLink}"
                style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #28372c; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Join Session →
              </a>
              <p style="margin-top: 24px; color: #737873; font-size: 13px;">
                If you can't join now, the session will wait until the admin starts it.
              </p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.warn(`⚠️ Failed to send reminder email to ${m.email}:`, emailErr);
      }
    });

    await Promise.allSettled(emailPromises);

    console.log(
      `✅ Session ${sessionId} → ready | ${memberRows.length} member(s) notified`,
    );

    return { sessionId, membersNotified: memberRows.length };
  } catch (err) {
    console.error(`❌ Session reminder failed for ${sessionId}:`, err);
    throw err;
  }
};
