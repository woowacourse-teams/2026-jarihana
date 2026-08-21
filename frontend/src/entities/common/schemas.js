import { z } from "zod";

export const entityIdSchema = z.number().int().positive();
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localTimeSchema = z.string().regex(/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/);
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/);

export function cursorPageSchema(itemSchema) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasNext: z.boolean()
  });
}
