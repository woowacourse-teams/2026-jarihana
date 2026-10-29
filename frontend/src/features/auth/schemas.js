import { z } from "zod";

import { bootcampStatusSchema, careerSchema, memberFieldSchema } from "../../entities/member/index.js";

export const memberTypeSchema = z.enum(["CREW", "COACH", "BOOTCAMP", "PROFESSIONAL"]);
export const courseSchema = z.enum(["BACKEND", "FRONTEND", "ANDROID"]);

const bootcampSchema = z
  .object({
    cohort: z.string().nullable(),
    name: z.string().min(1),
    status: bootcampStatusSchema
  })
  .strict();

const companySchema = z
  .object({
    name: z.string().min(1),
    visible: z.boolean()
  })
  .strict();

/**
 * 소속 필드는 크루와 코치에게 null로 온다. 이 필드가 없던 이전 백엔드 응답도 받도록 생략을 허용한다.
 */
export const memberSchema = z
  .object({
    avatarUrl: z.string().url(),
    bootcamp: bootcampSchema.nullable().optional(),
    career: careerSchema.nullable().optional(),
    company: companySchema.nullable().optional(),
    course: courseSchema.nullable(),
    crewName: z.string().min(1),
    field: memberFieldSchema.nullable().optional(),
    generation: z.number().int().positive().nullable(),
    id: z.number().int().positive(),
    memberType: memberTypeSchema
  })
  .strict();

export const meSchema = z
  .object({
    avatarUrl: z.string().url().optional(),
    member: memberSchema.nullable(),
    signupCompleted: z.boolean()
  })
  .strict()
  .refine((value) => value.signupCompleted === Boolean(value.member));
