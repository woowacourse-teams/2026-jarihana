import { z } from "zod";
import { apiClient } from "../../../shared/api";

export const RANKED_LEVELS = Object.freeze({
  easy: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
  hardest: "HARDEST",
  anotherHard: "ANOTHER_HARD",
  anotherHardest: "ANOTHER_HARDEST"
});

const levelSchema = z.enum(["EASY", "MEDIUM", "HARD", "HARDEST", "ANOTHER_HARD", "ANOTHER_HARDEST"]);

export const challengeSchema = z.object({
  challengeId: z.number().int(),
  level: levelSchema,
  scrollSpeed: z.number(),
  seed: z.number().int(),
  rulesVersion: z.string(),
  chartVersion: z.string(),
  status: z.enum(["CREATED", "PLAYING", "FINISHED", "INVALID"]),
  sequence: z.number().int().nonnegative(),
  score: z.number().int(),
  lives: z.number().int().nonnegative(),
  bestCombo: z.number().int().nonnegative(),
  loopReached: z.number().int().positive(),
  perfect: z.number().int().nonnegative(),
  hit: z.number().int().nonnegative(),
  enough: z.number().int().nonnegative(),
  uhoh: z.number().int().nonnegative(),
  poor: z.number().int().nonnegative(),
  miss: z.number().int().nonnegative(),
  invalidReason: z.enum(["ABANDONED", "LAGGED", "CLOCK_AHEAD", "STALE", "EXPIRED"]).nullable(),
  finishedAt: z.string().datetime({ local: true }).nullable()
});

const rankingItemSchema = z.object({
  memberId: z.number().int(),
  challengeId: z.number().int(),
  rank: z.number().int().positive(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  score: z.number().int(),
  bestCombo: z.number().int().nonnegative(),
  loopReached: z.number().int().positive(),
  achievedAt: z.string().datetime({ local: true })
});

export const rankingPageSchema = z.object({
  items: z.array(rankingItemSchema),
  me: rankingItemSchema.nullable(),
  nextCursor: z.string().nullable(),
  hasNext: z.boolean()
});

const root = "games/rhythm-harpoon";
const challengePath = (id, action) => `${root}/challenges/${id}/${action}`;

export const rhythmRankedApi = {
  create: ({ level, scrollSpeed }) =>
    apiClient.request(`${root}/challenges`, {
      method: "POST",
      json: { level: RANKED_LEVELS[level], scrollSpeed },
      schema: challengeSchema
    }),
  start: (id) => apiClient.request(challengePath(id, "start"), { method: "POST", schema: challengeSchema }),
  submit: (id, batch) =>
    apiClient.request(challengePath(id, "batches"), {
      method: "POST",
      json: {
        sequence: batch.sequence,
        playedUntil: batch.playedUntil,
        inputs: batch.inputs.map(([lane, at]) => ({ lane, at })),
        finished: Boolean(batch.finished)
      },
      schema: challengeSchema
    }),
  abandon: (id) =>
    apiClient.request(challengePath(id, "abandon"), { method: "POST", schema: challengeSchema }),
  rankings: (level, cursor, signal) =>
    apiClient.request(`${root}/rankings`, {
      schema: rankingPageSchema,
      searchParams: { level: RANKED_LEVELS[level], size: 20, ...(cursor ? { cursor } : {}) },
      signal
    })
};
