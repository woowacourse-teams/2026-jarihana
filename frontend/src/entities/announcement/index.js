import { z } from "zod";

import { cursorPageSchema, entityIdSchema, localDateTimeSchema } from "../common/schemas.js";

export const announcementScopeSchema = z.enum(["MEMBERS", "PUBLIC"]);

export const announcementListItemSchema = z.object({
  id: entityIdSchema,
  title: z.string(),
  scope: announcementScopeSchema,
  authorNickname: z.string(),
  createdAt: localDateTimeSchema
}).strict();

export const announcementListPageSchema = cursorPageSchema(announcementListItemSchema)
  .refine((page) => !page.hasNext || Boolean(page.nextCursor));

export const announcementDetailSchema = z.object({
  id: entityIdSchema,
  title: z.string(),
  content: z.string(),
  scope: announcementScopeSchema,
  authorNickname: z.string(),
  createdAt: localDateTimeSchema
}).strict();

export const announcementCreatedSchema = z.object({ id: entityIdSchema }).strict();
