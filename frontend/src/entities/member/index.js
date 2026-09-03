import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateTimeSchema } from "../common/schemas.js";
import { groupRoleSchema } from "../group/index.js";

export const memberTypeSchema = z.enum(["CREW", "COACH"]);
export const courseSchema = z.enum(["BACKEND", "FRONTEND", "ANDROID"]);

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
