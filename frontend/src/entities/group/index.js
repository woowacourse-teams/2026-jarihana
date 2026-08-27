import { z } from "zod";

import {
  cursorPageSchema,
  entityIdSchema,
  localDateSchema,
  localDateTimeSchema,
  localTimeSchema
} from "../common/schemas.js";

export const groupTypeSchema = z.enum(["CLUB", "STUDY", "SESSION"]);
export const groupMeetingTypeSchema = z.enum(["ONLINE", "OFFLINE", "FLEXIBLE"]);
export const groupStatusSchema = z.enum(["ACTIVE", "ENDED"]);
export const groupRoleSchema = z.enum(["LEADER", "MEMBER"]);
export const groupRelationSchema = z.literal("JOINED");
export const dayOfWeekSchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY"
]);

export const recurringScheduleSchema = z.object({
  daysOfWeek: z.array(dayOfWeekSchema),
  startTime: localTimeSchema,
  endTime: localTimeSchema
});

export const sessionScheduleSchema = z.object({
  sessionDate: localDateSchema,
  startTime: localTimeSchema,
  endTime: localTimeSchema
});

const leaderSchema = z.object({
  memberId: entityIdSchema,
  crewName: z.string(),
  generation: z.number().int().positive(),
  avatarUrl: z.string().url().optional()
});

const activeRecruitmentSchema = z.object({
  id: entityIdSchema,
  joinMethod: z.enum(["AUTO", "APPROVAL"]),
  capacity: z.number().int().positive(),
  approvedCount: z.number().int().nonnegative(),
  startsAt: localDateTimeSchema,
  endsAt: localDateTimeSchema.nullable()
});

export function normalizeRepresentativeImageUrl(imageUrl) {
  const absoluteUrl = /^https?:\/\//i.test(imageUrl);
  return imageUrl.startsWith("/") || absoluteUrl ? imageUrl : `/${imageUrl}`;
}

const representativeImageUrlSchema = z
  .string()
  .min(1)
  .transform(normalizeRepresentativeImageUrl)
  .nullable();

export const groupListItemSchema = z.object({
  id: entityIdSchema,
  type: groupTypeSchema,
  status: groupStatusSchema,
  name: z.string(),
  introduction: z.string(),
  representativeImageUrl: representativeImageUrlSchema,
  recurringSchedule: recurringScheduleSchema.nullable().optional(),
  sessionSchedule: sessionScheduleSchema.nullable().optional(),
  leader: leaderSchema.nullable(),
  memberCount: z.number().int().nonnegative(),
  activeRecruitment: activeRecruitmentSchema.nullable(),
  currentMemberRole: groupRoleSchema.nullable().optional()
});

export const groupListPageSchema = cursorPageSchema(groupListItemSchema);

export const groupDetailSchema = groupListItemSchema.extend({
  description: z.string().nullable(),
  meetingType: groupMeetingTypeSchema,
  location: z.string().max(255).nullable(),
  representativeImageKey: z.string().max(255).nullable().optional(),
  recurringSchedule: recurringScheduleSchema.nullable(),
  sessionSchedule: sessionScheduleSchema.nullable(),
  createdAt: localDateTimeSchema
});

export const groupCreateResponseSchema = z.object({
  id: entityIdSchema,
  status: groupStatusSchema
});

export const groupTerminateResponseSchema = z.object({
  id: entityIdSchema,
  status: z.literal("ENDED"),
  updatedAt: localDateTimeSchema
});
