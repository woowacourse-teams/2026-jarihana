import { z } from "zod";

export const apiErrorBodySchema = z
  .object({
    code: z.string().min(1),
    details: z.unknown().optional(),
    message: z.string().optional()
  })
  .strict();

export const apiEnvelopeSchema = z
  .object({
    data: z.unknown().nullable().optional(),
    error: apiErrorBodySchema.nullable().optional(),
    success: z.boolean()
  })
  .strict();
