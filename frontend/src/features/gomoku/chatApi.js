import { z } from "zod";
import { apiClient } from "../../shared/api/client";

const sequence = z.string().regex(/^(0|[1-9]\d*)$/);
export const chatSignalSchema = z.object({
  participationId: z.string().uuid(),
  latestSequence: sequence
});
export const chatMessageSchema = z.object({
  id: sequence,
  sequence,
  senderId: sequence,
  clientMessageId: z.string().uuid(),
  author: z.string(),
  senderRole: z.enum(["PARTICIPANT", "SPECTATOR"]).default("PARTICIPANT"),
  content: z.string(),
  createdAt: z.string().datetime({ local: true })
});
export const chatHistorySchema = chatSignalSchema.extend({
  items: z.array(chatMessageSchema),
  nextCursor: sequence.nullable(),
  hasNext: z.boolean()
});

const path = (roomId) => `games/gomoku/rooms/${roomId}/chat/messages`;
export const gomokuChatApi = {
  history: (roomId, searchParams, signal) =>
    apiClient.request(path(roomId), {
      searchParams,
      signal,
      cache: "no-store",
      schema: chatHistorySchema
    }),
  send: (roomId, body, signal) =>
    apiClient.request(path(roomId), {
      method: "POST",
      json: body,
      signal,
      schema: chatMessageSchema
    })
};

export function mergeChatMessages(current, incoming) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((left, right) => {
    const a = BigInt(left.sequence);
    const b = BigInt(right.sequence);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
