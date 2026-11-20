import { z } from "zod";
import { localDateTimeSchema } from "../../entities/common/schemas.js";
import { apiRequest } from "../../shared/api/index.js";

export const MAX_SPACE_BYTES = 2 * 1024 * 1024;

const blueprintRefSchema = z.object({ templateKey: z.string().min(1), version: z.number().int().positive() });
const bounds = z.object({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() }).passthrough();
const wall = z.object({ x: z.number(), z: z.number(), width: z.number(), depth: z.number() }).passthrough();
const geometrySchema = z.object({
  building: bounds.extend({ height: z.number() }), entrance: bounds, walls: z.array(wall), clearPaths: z.array(bounds),
  mezzanine: bounds.extend({ height: z.number() }).optional(), stairs: bounds.extend({ height: z.number(), steps: z.number().int().positive() }).optional(),
  mezzaninePaths: z.array(bounds).optional(), exterior: z.array(bounds).optional(),
  pillars: z.array(wall).optional(), railings: z.array(wall).optional(), stairRails: z.array(wall).optional(),
  island: z.object({ surface: bounds, walkable: bounds, bottomY: z.number() }).passthrough().optional(),
  terrace: bounds.extend({ fixtures: z.array(wall) }).optional()
}).passthrough().refine((geometry) => !geometry.mezzanine || (geometry.stairs && geometry.mezzaninePaths && geometry.pillars && geometry.railings && geometry.stairRails));
const blueprintSchema = z.object({ blueprintRef: blueprintRefSchema, geometry: geometrySchema });

export function fetchDefaultSpaceBlueprint(templateKey) {
  return apiRequest(`group-spaces/blueprints/${encodeURIComponent(templateKey)}/default`, { schema: blueprintSchema });
}

export const groupSpaceSchema = z.object({
  blueprintRef: blueprintRefSchema.nullish(), geometry: geometrySchema.nullish(),
  room: z.record(z.string(), z.unknown()).nullable(),
  revision: z.number().int().nonnegative(),
  canEdit: z.boolean(),
  updatedAt: localDateTimeSchema.nullable()
}).refine((space) => (space.room !== null || space.revision === 0) &&
  Boolean(space.blueprintRef) === Boolean(space.geometry) &&
  (!space.blueprintRef || space.blueprintRef.templateKey === (space.room?.template ?? "lounge")));

export function fetchGroupSpace(groupId) {
  return apiRequest(`groups/${groupId}/space`, { schema: groupSpaceSchema });
}

const clubhouseWeatherSchema = z.object({
  weatherCode: z.number().int().min(0).max(99),
  sunrise: localDateTimeSchema,
  sunset: localDateTimeSchema,
  stale: z.boolean().default(false)
}).refine(({ sunrise, sunset }) => sunrise.slice(0, 10) === sunset.slice(0, 10) && sunrise < sunset);

export function fetchClubhouseWeather(signal) {
  return apiRequest("group-spaces/weather", { schema: clubhouseWeatherSchema, signal });
}

function normalizeMemoryLink(item) {
  if (item.kind !== "memory" || typeof item.link !== "string" || !item.link || item.link.length > 1000) return item;
  try {
    const url = new URL(item.link);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return item;
    return { ...item, link: url.href };
  } catch {
    return item;
  }
}

export function saveGroupSpace(groupId, { room, expectedRevision, blueprintRef, replaceLayout }) {
  const payload = Array.isArray(room.items) ? { ...room, items: room.items.map(normalizeMemoryLink) } : room;
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_SPACE_BYTES) {
    throw new Error("사진을 조금 줄여 주세요. 공간 전체는 2MB까지 저장할 수 있어요.");
  }
  return apiRequest(`groups/${groupId}/space`, {
    method: "put",
    json: { room: payload, expectedRevision, ...(blueprintRef && { blueprintRef }), ...(replaceLayout && { replaceLayout: true }) },
    schema: groupSpaceSchema
  });
}
