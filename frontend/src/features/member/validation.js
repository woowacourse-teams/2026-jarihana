import { z } from "zod";

import { courseSchema } from "../../entities/member/index.js";

export const memberSignupFormSchema = z.object({
  crewName: z
    .string()
    .trim()
    .regex(/^[가-힣]{2,4}$/, "크루 이름은 한글 2~4자로 입력해 주세요."),
  generation: z.coerce.number().int().positive("기수는 1 이상의 숫자여야 해요."),
  course: courseSchema
});
