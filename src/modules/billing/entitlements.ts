import { and, eq, gte } from "drizzle-orm";
import { db } from "../../config/db";
import { groups, groupMembers } from "../../db/schema/groups";
import { files } from "../../db/schema/toolkit";
import { AppError } from "../../middleware/error.middleware";

export type PlanTier = "free" | "pro" | "commercial";

export const PLAN_LIMITS: Record<
  PlanTier,
  {
    maxMembersPerGroup: number | null;
    maxQuizQuestionsPerSession: number;
    monthlyToolkitSummaries: number | null;
  }
> = {
  free: {
    maxMembersPerGroup: 10,
    maxQuizQuestionsPerSession: 10,
    monthlyToolkitSummaries: 10,
  },
  pro: {
    maxMembersPerGroup: 20,
    maxQuizQuestionsPerSession: 50,
    monthlyToolkitSummaries: 100,
  },
  commercial: {
    maxMembersPerGroup: 50,
    maxQuizQuestionsPerSession: 100,
    monthlyToolkitSummaries: 500,
  },
};

export const getPlanTierForGroup = async (groupId: string): Promise<PlanTier> => {
  const [group] = await db
    .select({ planTier: groups.planTier })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    throw new AppError("Group not found", 404);
  }

  return group.planTier;
};

export const assertMemberCapForGroup = async (groupId: string) => {
  const planTier = await getPlanTierForGroup(groupId);
  const maxMembers = PLAN_LIMITS[planTier].maxMembersPerGroup;

  if (maxMembers === null) return;

  const members = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  if (members.length >= maxMembers) {
    throw new AppError(
      `This group has reached the ${maxMembers}-member limit for the ${planTier} plan. Upgrade to add more members.`,
      403,
    );
  }
};

export const assertQuizQuestionLimitForGroup = async (
  groupId: string,
  questionCount: number,
) => {
  const planTier = await getPlanTierForGroup(groupId);
  const maxQuestions = PLAN_LIMITS[planTier].maxQuizQuestionsPerSession;

  if (questionCount > maxQuestions) {
    throw new AppError(
      `Your ${planTier} plan allows up to ${maxQuestions} quiz questions per session.`,
      403,
    );
  }
};

export const assertToolkitSummaryQuotaForGroup = async (groupId: string) => {
  const planTier = await getPlanTierForGroup(groupId);
  const monthlyCap = PLAN_LIMITS[planTier].monthlyToolkitSummaries;

  if (monthlyCap === null) return;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const summarizedFiles = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.groupId, groupId),
        eq(files.hasAiSummary, true),
        gte(files.createdAt, monthStart),
      ),
    );

  if (summarizedFiles.length >= monthlyCap) {
    throw new AppError(
      `This group has reached its monthly AI summary quota (${monthlyCap}) for the ${planTier} plan.`,
      403,
    );
  }
};
