import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateTimeSchema } from "../common/schemas.js";
import { groupStatusSchema } from "../group/index.js";

export const joinMethodSchema = z.enum(["AUTO", "APPROVAL"]);
export const recruitingStatusSchema = z.enum(["SCHEDULED", "OPEN", "ALWAYS_OPEN", "CLOSED"]);

export const recruitmentListItemSchema = z.object({
  id: entityIdSchema,
  joinMethod: joinMethodSchema,
  capacity: z.number().int().positive(),
  approvedCount: z.number().int().nonnegative(),
  startsAt: localDateTimeSchema,
  endsAt: localDateTimeSchema.nullable(),
  recruitingStatus: recruitingStatusSchema,
  createdAt: localDateTimeSchema
});

export const recruitmentListPageSchema = cursorPageSchema(recruitmentListItemSchema);

export const recruitmentDetailSchema = recruitmentListItemSchema.extend({
  group: z.object({ id: entityIdSchema, name: z.string(), status: groupStatusSchema }),
  remainingSeats: z.number().int().nonnegative()
});

export const recruitmentCreateResponseSchema = z.object({
  id: entityIdSchema,
  groupId: entityIdSchema,
  joinMethod: joinMethodSchema,
  capacity: z.number().int().positive(),
  startsAt: localDateTimeSchema,
  endsAt: localDateTimeSchema.nullable(),
  recruitingStatus: recruitingStatusSchema
});

export const recruitmentCloseResponseSchema = z.object({
  id: entityIdSchema,
  endsAt: localDateTimeSchema,
  recruitingStatus: z.enum(["SCHEDULED", "UPCOMING", "OPEN", "ALWAYS_OPEN", "CLOSED"])
});
