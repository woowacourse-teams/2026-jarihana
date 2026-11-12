import { z } from "zod";
import { apiClient } from "../../shared/api";
const nullableId = z.number().int().nullable();
export const spectatorsSignalSchema = z.object({
  roomId: z.number().int().positive(),
  spectators: z
    .array(
      z.object({
        memberId: z.number().int().positive(),
        name: z.string().min(1),
        avatarUrl: z.string().url().nullable().default(null)
      })
    )
    .refine((people) => new Set(people.map((person) => person.memberId)).size === people.length)
});
export const roomSchema = z.object({
  id: z.number().int(),
  hostMemberId: z.number().int(),
  hostName: z.string(),
  hostAvatarUrl: z.string().url().nullable().default(null),
  guestMemberId: nullableId,
  guestName: z.string().nullable(),
  guestAvatarUrl: z.string().url().nullable().default(null),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  rule: z.enum(["RENJU", "FREESTYLE"]),
  status: z.enum(["WAITING", "PLAYING", "FINISHED", "CLOSED"]),
  hostReady: z.boolean(),
  guestReady: z.boolean(),
  gameNumber: z.number().int(),
  blackMemberId: z.number().int(),
  board: z.string().regex(/^[012]{225}$/),
  ply: z.number().int(),
  lastX: nullableId,
  lastY: nullableId,
  winnerMemberId: nullableId,
  endReason: z.enum(["FIVE", "DRAW", "TIMEOUT", "RESIGN"]).nullable(),
  revision: z.number().int(),
  serverNow: z.number(),
  turnDeadline: z.number().nullable()
});
const roomIdSchema = z.object({ roomId: z.number().int() });
export const statisticsSchema = z.object({
  total: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(100).nullable()
});
const historyItemSchema = z.object({
  id: z.number().int(),
  opponentName: z.string(),
  opponentAvatarUrl: z.string().url().nullable(),
  result: z.enum(["WIN", "LOSE", "DRAW"]),
  rule: z.enum(["RENJU", "FREESTYLE"]),
  endReason: z.enum(["FIVE", "DRAW", "RESIGN", "TIMEOUT"]),
  endedAt: z.string().datetime({ local: true })
});
const rankingItemSchema = statisticsSchema.extend({
  memberId: z.number().int(),
  rank: z.number().int().positive(),
  name: z.string(),
  avatarUrl: z.string().url().nullable()
});
const pageSchema = (item) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable(), hasNext: z.boolean() });
const pageParams = (cursor) => ({ size: 20, ...(cursor ? { cursor } : {}) });
export const lobbyRoomSchema = roomSchema.pick({
  id: true,
  hostMemberId: true,
  hostName: true,
  hostAvatarUrl: true,
  guestMemberId: true,
  guestName: true,
  guestAvatarUrl: true,
  visibility: true,
  rule: true,
  status: true
}).extend({ spectatorCount: z.number().int().nonnegative().default(0) });
const root = "games/gomoku";
const request = (path, options) => apiClient.request(`${root}/${path}`, options);
export const gomokuApi = {
  statistics: (signal) => request("history/me/summary", { schema: statisticsSchema, signal }),
  history: (cursor, signal) =>
    request("history/me", {
      schema: pageSchema(historyItemSchema),
      searchParams: pageParams(cursor),
      signal
    }),
  ranking: (cursor, signal) =>
    request("ranking", {
      schema: pageSchema(rankingItemSchema).extend({ me: rankingItemSchema.nullable() }),
      searchParams: pageParams(cursor),
      signal
    }),
  list: (cursor, keyword = "", signal) =>
    request("rooms", {
      schema: z.object({
        items: z.array(lobbyRoomSchema),
        nextCursor: z.union([z.string(), z.number()]).nullable(),
        hasNext: z.boolean()
      }),
      signal,
      searchParams: {
        view: "summary",
        size: 20,
        ...(cursor == null ? {} : { cursor }),
        ...(keyword ? { keyword } : {})
      }
    }),
  mine: (signal) => request("rooms/me", { schema: z.object({ roomId: nullableId }), signal }),
  create: (body) => request("rooms", { method: "POST", json: body, schema: roomIdSchema }),
  room: (id, signal, participationId) =>
    request(`rooms/${id}`, {
      schema: roomSchema,
      signal,
      ...(participationId ? { searchParams: { participationId } } : {})
    }),
  observe: (id, requestId, signal) =>
    request(`rooms/${id}/observations`, {
      method: "POST",
      json: { requestId },
      signal,
      schema: z.object({
        participationId: z.string().uuid(),
        chatStartSequence: z.string().regex(/^\d+$/)
      })
    }),
  leaveObservation: (id, participationId) =>
    request(`rooms/${id}/observations/${participationId}`, { method: "DELETE" }),
  join: (id, token) =>
    request(`rooms/${id}/join`, {
      method: "POST",
      json: token ? { token } : {},
      schema: roomIdSchema
    }),
  ready: (id, body) =>
    request(`rooms/${id}/ready`, { method: "PUT", json: body, schema: roomIdSchema }),
  start: (id, gameNumber) =>
    request(`rooms/${id}/start`, { method: "POST", json: { gameNumber }, schema: roomIdSchema }),
  move: (id, body) =>
    request(`rooms/${id}/moves`, { method: "POST", json: body, schema: roomIdSchema }),
  resign: (id, gameNumber) =>
    request(`rooms/${id}/resign`, { method: "POST", json: { gameNumber }, schema: roomIdSchema }),
  leave: (id) => request(`rooms/${id}/leave`, { method: "POST", schema: roomIdSchema }),
  invite: (id) =>
    request(`rooms/${id}/invite`, { method: "POST", schema: z.object({ token: z.string() }) }),
  preview: (token) =>
    request(`invitations/${encodeURIComponent(token)}`, {
      schema: roomSchema.pick({
        id: true,
        hostName: true,
        guestName: true,
        rule: true,
        visibility: true,
        status: true
      })
    })
};

export function newerSnapshot(current, next) {
  return !current || (current.id === next.id && next.revision > current.revision) ? next : current;
}
export function turnMemberId(room) {
  if (room.status !== "PLAYING") return null;
  return room.ply % 2 === 0
    ? room.blackMemberId
    : room.blackMemberId === room.hostMemberId
      ? room.guestMemberId
      : room.hostMemberId;
}
