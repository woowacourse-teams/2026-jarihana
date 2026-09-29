import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateSchema, localDateTimeSchema } from "../common/schemas.js";
import { groupStatusSchema, groupTypeSchema } from "../group/index.js";

const activityPostGroupSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  type: groupTypeSchema,
  status: groupStatusSchema
});

function normalizeImageUrl(imageUrl) {
  return /^https?:\/\//i.test(imageUrl) || imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
}

export const activityPostSchema = z.object({
  id: entityIdSchema,
  group: activityPostGroupSchema,
  authorNickname: z.string().min(1),
  imageUrl: z.string().min(1).transform(normalizeImageUrl),
  caption: z.string().max(50).nullable(),
  activityDate: localDateSchema,
  createdAt: localDateTimeSchema,
  canModify: z.boolean()
});

export const activityPostPageSchema = cursorPageSchema(activityPostSchema);

export const activityPostCreateResponseSchema = z.object({ id: entityIdSchema });
