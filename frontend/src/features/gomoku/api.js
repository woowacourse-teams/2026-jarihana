import { z } from "zod";
import { apiClient } from "../../shared/api";
const nullableId = z.number().int().nullable();
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
const root = "games/gomoku";
const request = (path, options) => apiClient.request(`${root}/${path}`, options);
export const gomokuApi = {
  list: (cursor, keyword = "", signal) =>
    request("rooms", {
      schema: z.object({
        items: z.array(roomSchema),
        nextCursor: z.union([z.string(), z.number()]).nullable(),
        hasNext: z.boolean()
      }),
      signal,
      searchParams: {
        size: 20,
        ...(cursor == null ? {} : { cursor }),
        ...(keyword ? { keyword } : {})
      }
    }),
  mine: (signal) => request("rooms/me", { schema: z.object({ roomId: nullableId }), signal }),
  create: (body) => request("rooms", { method: "POST", json: body, schema: roomIdSchema }),
  room: (id, signal) => request(`rooms/${id}`, { schema: roomSchema, signal }),
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
