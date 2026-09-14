import { z } from "zod";

import { courseSchema, memberTypeSchema } from "../../entities/member/index.js";

export const memberSignupFormSchema = z.object({
  memberType: memberTypeSchema.or(z.literal("")),
  crewName: z
    .string()
    .trim()
    .regex(/^[가-힣]{2,4}$/, "크루 이름은 한글 2~4자로 입력해 주세요."),
  generation: z
    .union([z.literal(""), z.coerce.number().int().positive("기수는 1 이상의 숫자여야 해요.")])
    .optional(),
  course: courseSchema.or(z.literal(""))
}).superRefine((values, context) => {
  if (values.memberType === "") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "가입 유형을 선택해 주세요.",
      path: ["memberType"]
    });
  }
  if (values.memberType === "CREW" && values.course === "") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "과정을 선택해 주세요.",
      path: ["course"]
    });
  }
  if (values.memberType === "CREW" && (values.generation === undefined || values.generation === "")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "기수를 선택해 주세요.",
      path: ["generation"]
    });
  }
}).transform(({ crewName, course, generation, memberType }) =>
  memberType === "COACH" ? { crewName, memberType } : { crewName, memberType, course, generation }
);
