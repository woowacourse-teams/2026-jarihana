import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateTimeSchema } from "../common/schemas.js";
import { courseSchema } from "../member/index.js";

export const registrationStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export const registrationDecisionSchema = z.enum(["APPROVED", "REJECTED"]);
export const decisionActorSchema = z.object({
  type: z.enum(["SYSTEM", "MEMBER"]),
  memberId: entityIdSchema.nullable().optional()
});

export const registrationCreateResponseSchema = z.object({
  id: entityIdSchema,
  status: registrationStatusSchema,
  registeredAt: localDateTimeSchema,
  decidedAt: localDateTimeSchema.nullable().optional(),
  decidedBy: decisionActorSchema.nullable().optional()
});

export const registrationDecisionResponseSchema = z.object({
  id: entityIdSchema,
  status: registrationStatusSchema,
  decisionReason: z.string().nullable(),
  decidedAt: localDateTimeSchema,
  decidedBy: decisionActorSchema
});

export const registrationSchema = z.object({
  id: entityIdSchema,
  member: z.object({
    id: entityIdSchema,
    crewName: z.string(),
    generation: z.number().int().positive(),
    course: courseSchema
  }),
  message: z.string().nullable(),
  status: registrationStatusSchema,
  registeredAt: localDateTimeSchema,
  decisionReason: z.string().nullable(),
  decidedAt: localDateTimeSchema.nullable(),
  decidedBy: decisionActorSchema.nullable()
});

export const registrationPageSchema = cursorPageSchema(registrationSchema);

export const myRegistrationSchema = registrationSchema.omit({ member: true }).extend({
  group: z.object({ id: entityIdSchema, name: z.string() }),
  recruitmentId: entityIdSchema
});

export const myRegistrationPageSchema = cursorPageSchema(myRegistrationSchema);
