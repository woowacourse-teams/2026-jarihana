import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateTimeSchema } from "../common/schemas.js";
import { groupRoleSchema } from "../group/index.js";

export const memberTypeSchema = z.enum(["CREW", "COACH", "BOOTCAMP", "PROFESSIONAL"]);
export const courseSchema = z.enum(["BACKEND", "FRONTEND", "ANDROID"]);

/** 기수 없이 유형으로 표시하는 회원의 이름이다. 크루는 기수와 과정으로 표시한다. */
export const NON_CREW_MEMBER_TYPE_LABELS = Object.freeze({
  COACH: "코치",
  BOOTCAMP: "부트캠프",
  PROFESSIONAL: "현직자"
});

export function nonCrewMemberTypeLabel(memberType) {
  return NON_CREW_MEMBER_TYPE_LABELS[memberType] ?? null;
}

const COHORT_TYPE_ORDER = Object.freeze(["COACH", "BOOTCAMP", "PROFESSIONAL"]);

/** 기수 분포에서 회원을 묶는 키다. 크루는 기수 숫자, 기수가 없는 유형은 유형 값, 알 수 없으면 "unknown"이다. */
export function memberCohortKey(member) {
  if (nonCrewMemberTypeLabel(member.memberType)) return member.memberType;
  return Number.isInteger(member.generation) && member.generation > 0 ? member.generation : "unknown";
}

function cohortRank(key) {
  if (typeof key === "number") return 0;
  const typeIndex = COHORT_TYPE_ORDER.indexOf(key);
  return typeIndex >= 0 ? typeIndex + 1 : COHORT_TYPE_ORDER.length + 1;
}

/** 기수 오름차순, 그다음 코치, 부트캠프, 현직자, 마지막에 기수 미정 순서다. */
export function compareMemberCohortKeys(left, right) {
  const byRank = cohortRank(left) - cohortRank(right);
  if (byRank !== 0) return byRank;
  return typeof left === "number" && typeof right === "number" ? left - right : 0;
}

export function memberCohortLabel(key) {
  if (typeof key === "number") return `${key}기`;
  return nonCrewMemberTypeLabel(key) ?? "기수 미정";
}

export const memberSchema = z.object({
  id: entityIdSchema,
  crewName: z.string(),
  memberType: memberTypeSchema,
  generation: z.number().int().positive().nullable(),
  course: courseSchema.nullable(),
  avatarUrl: z.string()
});

export const memberProfileSchema = z.discriminatedUnion("signupCompleted", [
  z.object({ signupCompleted: z.literal(false), member: z.null() }),
  z.object({ signupCompleted: z.literal(true), member: memberSchema })
]);

export const memberSignupResponseSchema = z.object({
  id: entityIdSchema,
  crewName: z.string(),
  memberType: memberTypeSchema,
  generation: z.number().int().positive().nullable(),
  course: courseSchema.nullable(),
  joinedAt: localDateTimeSchema
});

export const groupMemberSchema = z.object({
  groupMemberId: entityIdSchema,
  memberId: entityIdSchema,
  crewName: z.string(),
  memberType: memberTypeSchema,
  generation: z.number().int().positive().nullable(),
  course: courseSchema.nullable(),
  avatarUrl: z.string().url().optional(),
  role: groupRoleSchema,
  joinedAt: localDateTimeSchema
});

export const groupMemberPageSchema = cursorPageSchema(groupMemberSchema);

export const transferLeaderResponseSchema = z.object({
  groupId: entityIdSchema,
  previousLeaderGroupMemberId: entityIdSchema,
  leaderGroupMemberId: entityIdSchema
});
