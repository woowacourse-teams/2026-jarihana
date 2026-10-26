import { z } from "zod";

export const sequenceSchema = z.string().regex(/^(0|[1-9]\d*)$/);
export const messageSchema = z.object({
  id: sequenceSchema, groupId: sequenceSchema, sequence: sequenceSchema,
  senderId: sequenceSchema, author: z.string(), clientMessageId: z.string(),
  content: z.string(), createdAt: z.string()
});
export const readSchema = z.object({ groupId: sequenceSchema, lastReadSequence: sequenceSchema, latestSequence: sequenceSchema, unreadCount: z.number().int().nonnegative() });
export const roomSchema = z.object({
  groupId: sequenceSchema, name: z.string(), type: z.enum(["STUDY", "CLUB", "SESSION"]),
  description: z.string().nullable(), memberCount: z.number(), status: z.enum(["ACTIVE", "ENDED"]),
  representativeImageUrl: z.string().nullable().optional(),
  latestSequence: sequenceSchema, lastReadSequence: sequenceSchema, unreadCount: z.number().int().nonnegative(),
  lastMessage: messageSchema.nullable(), updatedAt: z.string()
});
export const roomsSchema = z.object({ items: z.array(roomSchema), nextCursor: z.string().nullable(), hasNext: z.boolean() });
export const historySchema = z.object({
  items: z.array(messageSchema), nextCursor: sequenceSchema.nullable(), hasNext: z.boolean(),
  latestSequence: sequenceSchema, lastReadSequence: sequenceSchema, status: z.enum(["ACTIVE", "ENDED"])
});
export function compareSequence(a, b) { return a.length - b.length || a.localeCompare(b); }
export function mergeMessages(existing, incoming) {
  const messages = [...existing];
  for (const message of incoming) {
    const index = messages.findIndex((item) => item.id === message.id ||
      (item.clientMessageId === message.clientMessageId && item.senderId === message.senderId));
    if (index < 0) {
      messages.push(message);
      continue;
    }
    const confirmed = !message.pending && !message.failed;
    const existingMessage = messages[index];
    if (confirmed || existingMessage.pending || existingMessage.failed) messages[index] = message;
  }
  return messages.sort((a, b) => {
    if (a.sequence && b.sequence) return compareSequence(a.sequence, b.sequence);
    if (a.sequence) return -1;
    if (b.sequence) return 1;
    return 0;
  });
}
