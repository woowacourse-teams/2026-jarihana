import { z } from "zod";

export const memberTypeSchema = z.enum(["CREW", "COACH"]);
export const courseSchema = z.enum(["BACKEND", "FRONTEND", "ANDROID"]);

export const memberSchema = z
  .object({
    avatarUrl: z.string().url(),
    course: courseSchema.nullable(),
    crewName: z.string().min(1),
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
