import { z } from "zod";

import { registrationDecisionSchema } from "../../entities/registration/index.js";

export const registrationFormSchema = z.object({
  message: z.string().max(1_000).nullable().optional()
});

export const registrationDecisionFormSchema = z
  .object({
    status: registrationDecisionSchema,
    decisionReason: z.string().max(1_000).nullable().optional()
  })
  .superRefine((values, context) => {
    const hasReason = typeof values.decisionReason === "string" && values.decisionReason.length > 0;
    if (values.status === "APPROVED" && hasReason) {
      context.addIssue({
        code: "custom",
        message: "승인할 때는 사유를 입력하지 않아요.",
        path: ["decisionReason"]
      });
    }
  });
