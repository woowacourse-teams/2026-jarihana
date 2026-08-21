import { z } from "zod";

export const courseSchema = z.enum(["BACKEND", "FRONTEND", "ANDROID"]);

export const memberSchema = z
  .object({
    avatarUrl: z.string().url(),
    course: courseSchema,
    crewName: z.string().min(1),
    generation: z.number().int().positive(),
    id: z.number().int().positive()
  })
  .strict();

export const meSchema = z
  .object({
    member: memberSchema.nullable(),
    signupCompleted: z.boolean()
  })
  .strict()
  .refine((value) => value.signupCompleted === Boolean(value.member));
