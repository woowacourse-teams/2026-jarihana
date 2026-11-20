import { z } from "zod";
import { apiClient } from "../../../../shared/api";
import { RANKED_LEVELS } from "../rankedApi.js";

const levelSchema = z.enum(["EASY", "MEDIUM", "HARD", "HARDEST", "ANOTHER_HARD", "ANOTHER_HARDEST"]);
const statusSchema = z.enum(["WAITING", "PLAYING", "FINISHED", "CLOSED"]);
const endReasonSchema = z.enum(["ELIMINATED", "FORFEIT", "DRAW"]);
const outReasonSchema = z.enum(["ELIMINATED", "ABANDONED", "STALE", "LAGGED", "CLOCK_AHEAD"]);

// 서버 난이도 이름(EASY)과 화면 엔진의 난이도 키(easy)를 오간다.
export const fromServerLevel = (level) =>
  Object.keys(RANKED_LEVELS).find((key) => RANKED_LEVELS[key] === level);
export const toServerLevel = (level) => RANKED_LEVELS[level];

const playerSchema = z.object({
  memberId: z.number().int(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  ready: z.boolean(),
  scrollSpeed: z.number()
});

export const battleRunSchema = z.object({
  memberId: z.number().int(),
  status: z.enum(["PLAYING", "OUT"]),
  outReason: outReasonSchema.nullable(),
  outAt: z.number().nullable(),
  playedUntil: z.number(),
  lastSequence: z.number().int().nonnegative(),
  scrollSpeed: z.number(),
  score: z.number().int(),
  combo: z.number().int().nonnegative(),
  bestCombo: z.number().int().nonnegative(),
  lives: z.number().int().nonnegative(),
  loopReached: z.number().int().positive(),
  perfect: z.number().int().nonnegative(),
  hit: z.number().int().nonnegative(),
  enough: z.number().int().nonnegative(),
  uhoh: z.number().int().nonnegative(),
  poor: z.number().int().nonnegative(),
  miss: z.number().int().nonnegative()
});

export const battleRoomSchema = z.object({
  id: z.number().int(),
  revision: z.number().int(),
  serverNow: z.number(),
  status: statusSchema,
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  level: levelSchema,
  chartVersion: z.string(),
  gameNumber: z.number().int().nonnegative(),
  seed: z.number().int(),
  startsAt: z.number().nullable(),
  host: playerSchema,
  guest: playerSchema.nullable(),
  winnerMemberId: z.number().int().nullable(),
  endReason: endReasonSchema.nullable(),
  runs: z.array(battleRunSchema)
});

export const battleBatchesSchema = z.object({
  gameNumber: z.number().int(),
  items: z.array(
    z.object({
      id: z.number().int(),
      memberId: z.number().int(),
      sequence: z.number().int().positive(),
      playedUntil: z.number(),
      inputs: z.array(z.tuple([z.number().int().min(0).max(3), z.number()]))
    })
  )
});

export const battleChatItemSchema = z.object({
  id: z.number().int(),
  memberId: z.number().int(),
  senderName: z.string(),
  body: z.string(),
  clientMessageId: z.string(),
  createdAt: z.string()
});
export const battleChatSchema = z.object({ items: z.array(battleChatItemSchema) });

const runResultSchema = z.object({
  gameNumber: z.number().int(),
  status: z.enum(["PLAYING", "OUT"]),
  outReason: outReasonSchema.nullable(),
  outAt: z.number().nullable(),
  playedUntil: z.number(),
  score: z.number().int(),
  combo: z.number().int(),
  lives: z.number().int(),
  roomStatus: statusSchema,
  winnerMemberId: z.number().int().nullable(),
  endReason: endReasonSchema.nullable()
});

const lobbySchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      hostName: z.string(),
      hostAvatarUrl: z.string().url().nullable(),
      level: levelSchema,
      createdAt: z.string()
    })
  ),
  nextCursor: z.string().nullable(),
  hasNext: z.boolean()
});

const rankingItemSchema = z.object({
  rank: z.number().int().positive(),
  memberId: z.number().int(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

const roomIdSchema = z.object({ roomId: z.number().int() });
const root = "games/rhythm-battle";
const request = (path, options) => apiClient.request(`${root}/${path}`, options);

export const rhythmBattleApi = {
  lobby: (cursor, signal) =>
    request("rooms", { schema: lobbySchema, signal, searchParams: { size: 20, ...(cursor ? { cursor } : {}) } }),
  mine: (signal) => request("rooms/me", { schema: z.object({ roomId: z.number().int().nullable() }), signal }),
  room: (id, signal) => request(`rooms/${id}`, { schema: battleRoomSchema, signal }),
  invitation: (token, signal) =>
    request(`invitations/${token}`, {
      schema: z.object({
        roomId: z.number().int(),
        hostName: z.string(),
        level: levelSchema,
        status: statusSchema,
        joinable: z.boolean()
      }),
      signal
    }),
  chat: (id, signal) => request(`rooms/${id}/chat/messages`, { schema: battleChatSchema, signal }),
  ranking: (cursor, signal) =>
    request("ranking", {
      schema: z.object({
        items: z.array(rankingItemSchema),
        me: rankingItemSchema.nullable(),
        nextCursor: z.string().nullable(),
        hasNext: z.boolean()
      }),
      searchParams: { size: 20, ...(cursor ? { cursor } : {}) },
      signal
    }),
  summary: (signal) =>
    request("history/me/summary", {
      schema: z.object({
        total: z.number().int(),
        wins: z.number().int(),
        losses: z.number().int(),
        draws: z.number().int()
      }),
      signal
    }),
  create: ({ visibility, level }) =>
    request("rooms", { method: "POST", json: { visibility, level: toServerLevel(level) }, schema: roomIdSchema }),
  join: (id, token) =>
    request(`rooms/${id}/join`, { method: "POST", json: token ? { token } : {}, schema: roomIdSchema }),
  ready: (id, { ready, gameNumber, scrollSpeed }) =>
    request(`rooms/${id}/ready`, { method: "PUT", json: { ready, gameNumber, scrollSpeed }, schema: roomIdSchema }),
  start: (id, gameNumber) =>
    request(`rooms/${id}/start`, { method: "POST", json: { gameNumber }, schema: roomIdSchema }),
  leave: (id) => request(`rooms/${id}/leave`, { method: "POST", json: {}, schema: roomIdSchema }),
  invite: (id) => request(`rooms/${id}/invite`, { method: "POST", json: {}, schema: z.object({ token: z.string() }) }),
  submit: (id, gameNumber, batch) =>
    request(`rooms/${id}/batches`, {
      method: "POST",
      json: {
        gameNumber,
        sequence: batch.sequence,
        playedUntil: batch.playedUntil,
        inputs: batch.inputs.map(([lane, at]) => ({ lane, at })),
        finished: Boolean(batch.finished)
      },
      schema: runResultSchema
    }),
  forfeit: (id, gameNumber) =>
    request(`rooms/${id}/forfeit`, { method: "POST", json: { gameNumber }, schema: runResultSchema }),
  send: (id, clientMessageId, body) =>
    request(`rooms/${id}/chat/messages`, {
      method: "POST",
      json: { clientMessageId, body },
      schema: battleChatItemSchema
    })
};
