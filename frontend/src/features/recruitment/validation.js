import { z } from "zod";

import { joinMethodSchema } from "../../entities/recruitment/index.js";

const localDateTimeInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const optionalEndSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  localDateTimeInputSchema.nullable()
);

export const recruitmentCreateFormSchema = z
  .object({
    joinMethod: joinMethodSchema,
    capacity: z.coerce.number().int().positive("모집 인원은 1명 이상이어야 해요."),
    startsAt: localDateTimeInputSchema,
    endsAt: optionalEndSchema
  })
  .refine((values) => values.endsAt === null || values.endsAt > values.startsAt, {
    message: "종료 일시는 시작 일시보다 늦어야 해요.",
    path: ["endsAt"]
  });
