import { eq, and, count } from "drizzle-orm";
import { db } from "../config/db";
import { groups, groupMembers } from "../db/schema/groups";
import { sessions } from "../db/schema/sessions";
import { files } from "../db/schema/toolkit";
import { messages } from "../db/schema/messages";
import { users } from "../db/schema/users";

// ────────────────────────────────────────────────────────
//  GROUP CONTEXT — injected into every AI prompt
// ────────────────────────────────────────────────────────

export interface GroupContext {
  name: string;
  subject: string;
  goal: string;
  memberCount: number;
  completedSessions: number;
  contextString: string;
}

export const buildGroupContext = async (
  groupId: string,
): Promise<GroupContext> => {
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return {
      name: "Study Group",
      subject: "General",
      goal: "Study effectively",
      memberCount: 0,
      completedSessions: 0,
      contextString: "",
    };
  }

  const [memberResult] = await db
    .select({ count: count() })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  const [sessionResult] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.groupId, groupId), eq(sessions.status, "ended")));

  const memberCount = Number(memberResult?.count ?? 0);
  const completedSessions = Number(sessionResult?.count ?? 0);

  const contextString = `
Group: "${group.name}"
Subject/Focus Area: "${group.subject}"
Group Goal: "${group.goal}"
Members: ${memberCount} students
Completed study sessions: ${completedSessions}
  `.trim();

  return {
    name: group.name,
    subject: group.subject,
    goal: group.goal,
    memberCount,
    completedSessions,
    contextString,
  };
};

// ────────────────────────────────────────────────────────
//  SESSION TRANSCRIPT — fetches all chat messages for a session
// ────────────────────────────────────────────────────────

export interface TranscriptMessage {
  userName: string;
  text: string;
  createdAt: Date;
}

export const buildSessionTranscript = async (
  sessionId: string,
  maxMessages: number = 200,
): Promise<{ lines: TranscriptMessage[]; text: string }> => {
  const rows = await db
    .select({
      text: messages.text,
      userName: users.name,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt)
    .limit(maxMessages);

  const text = rows
    .map((m) => `[${m.userName}]: ${m.text}`)
    .join("\n");

  return { lines: rows, text };
};

// ────────────────────────────────────────────────────────
//  TOOLKIT CONTEXT — formatted file list with summaries
// ────────────────────────────────────────────────────────

export const buildToolkitContext = async (
  groupId: string,
  fileIds?: string[],
): Promise<string> => {
  const allFiles = await db
    .select()
    .from(files)
    .where(eq(files.groupId, groupId));

  const relevant =
    fileIds && fileIds.length > 0
      ? allFiles.filter((f) => fileIds.includes(f.id))
      : allFiles;

  const withSummary = relevant.filter((f) => f.summary);

  if (withSummary.length === 0) return "";

  return withSummary
    .map(
      (f, i) =>
        `[Material ${i + 1}: ${f.name} (${f.type.toUpperCase()})]\n${f.summary}`,
    )
    .join("\n\n");
};
