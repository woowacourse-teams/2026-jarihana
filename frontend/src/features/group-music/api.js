import { z } from "zod";
import { localDateTimeSchema } from "../../entities/common/schemas.js";
import { apiRequest } from "../../shared/api/index.js";
import { parseYoutubeUrl } from "./youtubeUrl.js";
import { stampMusicSnapshot } from "./timeline.js";

const youtubeUrlError = "유튜브 영상 또는 재생목록의 HTTPS 주소를 입력해 주세요.";
const playlistTitle = z.string().min(1, "플레이리스트 이름을 입력해 주세요.").max(80);
const playlistUrl = z.string().max(500);
const playlistSchema = z.object({
  title: playlistTitle,
  url: playlistUrl.refine((url) => Boolean(parseYoutubeUrl(url)), youtubeUrlError)
});
export const musicSchema = z.object({
  enabled: z.boolean(), autoplay: z.boolean(), title: playlistTitle, url: playlistUrl,
  playlists: z.array(playlistSchema).max(20).optional(),
  queue: z.array(playlistSchema.extend({ id: z.string().min(1) })).max(50).optional(),
  currentQueueId: z.string().min(1).nullable().optional()
}).refine((music) => music.url === "" ? !music.enabled : Boolean(parseYoutubeUrl(music.url)), {
  message: youtubeUrlError, path: ["url"]
});
const instantSchema = z.string().datetime({ precision: null });
export const playbackSchema = z.object({
  state: z.enum(["PLAYING", "PAUSED"]), playlistIndex: z.number().int().min(0),
  positionSeconds: z.number().min(0), anchorTime: instantSchema, revision: z.number().int().nonnegative()
});
export const groupMusicSchema = z.object({
  music: musicSchema, revision: z.number().int().nonnegative(), canEdit: z.boolean(), canAdd: z.boolean().optional(), updatedAt: localDateTimeSchema.nullable(),
  serverTime: instantSchema, playback: playbackSchema
});
export const fetchGroupMusic = (groupId, signal) => apiRequest(`groups/${groupId}/music`, { schema: groupMusicSchema, ...(signal && { signal }) }).then(stampMusicSnapshot);
export function saveGroupMusic(groupId, { music, expectedRevision }) {
  const parsed = musicSchema.safeParse(music);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return apiRequest(`groups/${groupId}/music`, { method: "put", json: { music: parsed.data, expectedRevision }, schema: groupMusicSchema }).then(stampMusicSnapshot);
}

export function saveMusicPlayback(groupId, command) {
  return apiRequest(`groups/${groupId}/music/playback`, { method: "put", json: command, schema: groupMusicSchema }).then(stampMusicSnapshot);
}
export function advanceMusicPlayback(groupId, command) {
  return apiRequest(`groups/${groupId}/music/playback/advance`, { method: "post", json: command, schema: groupMusicSchema }).then(stampMusicSnapshot);
}

export function enqueueGroupMusic(groupId, item) {
  const parsed = playlistSchema.safeParse(item);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return apiRequest(`groups/${groupId}/music/queue`, { method: "post", json: parsed.data, schema: groupMusicSchema }).then(stampMusicSnapshot);
}

export function skipGroupMusic(groupId, expectedRevision) {
  return apiRequest(`groups/${groupId}/music/queue/skip`, { method: "post", json: { expectedRevision }, schema: groupMusicSchema }).then(stampMusicSnapshot);
}
