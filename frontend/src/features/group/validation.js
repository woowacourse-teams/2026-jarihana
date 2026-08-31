import { z } from "zod";

import {
  dayOfWeekSchema,
  groupMeetingTypeSchema,
  groupTypeSchema
} from "../../entities/group/index.js";

const localTimeInputSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const recurringScheduleFormSchema = z
  .object({
    daysOfWeek: z.array(dayOfWeekSchema).min(1),
    startTime: localTimeInputSchema,
    endTime: localTimeInputSchema
  })
  .refine((schedule) => schedule.endTime > schedule.startTime, {
    message: "종료 시간은 시작 시간보다 늦어야 해요.",
    path: ["endTime"]
  });

export const sessionScheduleFormSchema = z
  .object({
    sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: localTimeInputSchema,
    endTime: localTimeInputSchema
  })
  .refine((schedule) => schedule.endTime > schedule.startTime, {
    message: "종료 시간은 시작 시간보다 늦어야 해요.",
    path: ["endTime"]
  });

export const groupModifyFormSchema = z.object({
  name: z.string().trim().min(1, "모임 이름을 입력해 주세요.").max(50),
  introduction: z.string().trim().min(1, "한 줄 소개를 입력해 주세요.").max(100),
  description: z.string().max(10_000).nullable().optional(),
  meetingType: groupMeetingTypeSchema,
  location: z.string().max(255).nullable(),
  representativeImageKey: z.string().max(255).nullable().optional()
});

export const groupCreateFormSchema = groupModifyFormSchema
  .extend({
    type: groupTypeSchema,
    recurringSchedule: recurringScheduleFormSchema.nullable(),
    sessionSchedule: sessionScheduleFormSchema.nullable()
  })
  .superRefine((values, context) => {
    /*
     * CLUB과 STUDY는 recurringSchedule을 생략할 수 있다. 도메인이 없는 일정을
     * 유동적으로 읽으므로, 여기서 요구하면 백엔드가 지원하는 상태를 막게 된다.
     */
    if (values.type === "SESSION" && values.sessionSchedule === null) {
      context.addIssue({
        code: "custom",
        message: "세션 일정을 입력해 주세요.",
        path: ["sessionSchedule"]
      });
    }
  });
