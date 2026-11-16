import { z } from "zod";
import { apiRequest } from "../../shared/api";

const root = "games/chair-stack";
const chair = z.object({
  width: z.number(), left: z.number(), right: z.number(),
  orientation: z.number().default(0),
  toy: z.object({ color: z.enum(["red", "yellow", "green", "blue"]), rows: z.array(z.number()) }).optional()
});
const physicsPiece = z.object({
  color: z.enum(["red", "yellow", "green", "blue"]),
  mirror: z.boolean(), angle: z.number(), widthScale: z.number(), heightScale: z.number(),
  verticalShear: z.number().default(0),
  flat: z.boolean().default(false),
  sideProfile: z.boolean().default(false)
});
const pose = z.object({ x: z.number(), y: z.number(), angle: z.number() });
const physics = z.object({
  chairs: z.array(z.object({ piece: physicsPiece, pose })),
  active: physicsPiece.nullable(),
  preview: physicsPiece.nullable(),
  launchY: z.number(),
  platformHalfWidth: z.number()
});
const run = z.object({
  id: z.string(),
  placements: z.array(z.object({ chair, x: z.number(), y: z.number().nullish(), orientation: z.number().default(0) })),
  active: chair.nullable(),
  preview: chair.nullable(),
  failedLayer: z.number().nullable(),
  finished: z.boolean(),
  toyMode: z.boolean().default(false),
  physics: physics.nullish(),
  motion: z.object({ amplitude: z.number(), periodMs: z.number(), fallMs: z.number() })
});
const state = z.object({
  guest: z.boolean(),
  nickname: z.string().nullable(),
  bestScore: z.number(),
  run: run.nullable(),
  frames: z.array(z.object({ atMs: z.number(), poses: z.array(pose) })).default([])
});
const item = z.object({
  rank: z.number(),
  nickname: z.string(),
  guest: z.boolean(),
  score: z.number()
});
const ranking = z.object({
  items: z.array(item),
  me: item.nullable(),
  nextCursor: z.string().nullable(),
  hasNext: z.boolean()
});

export const chairStackApi = {
  current: (member, signal) => apiRequest(root + "/runs/current", {
    schema: state,
    signal,
    searchParams: member ? { member: true } : undefined
  }),
  start: (json) => apiRequest(root + "/runs", { method: "POST", json, schema: state }),
  drop: (json) => apiRequest(root + "/drops", { method: "POST", json, schema: state }),
  rankings: (cursor, signal) => apiRequest(root + "/rankings", {
    schema: ranking,
    signal,
    searchParams: cursor ? { cursor } : undefined
  })
};
