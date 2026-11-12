import { z } from "zod";
import { readAvatarAppearance } from "../../../../public/sparring-arena/src/avatar-appearance.js";

const id = z.string().min(1).max(160);
const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const movement = z.object({ memberId: id, position: point, yaw: z.number().finite(),
  locomotion: z.enum(["idle", "walking", "running", "jumping"]) });
const participant = movement.extend({
  displayName: z.string().max(200), avatarColor: z.string().regex(/^#[\da-f]{6}$/i),
  avatarAppearance: z.unknown().transform(readAvatarAppearance).optional(),
  seat: z.object({ assetId: id, slot: z.number().int().nonnegative(), position: point, approach: point, yaw: z.number().finite() }).nullable(),
  heldItemId: id.nullable(), pose: z.string().max(40),
  emote: z.object({ kind: z.string().max(40), startedAt: z.number(), expiresAt: z.number() }).nullable()
});
const item = z.object({ id, kind: z.string().max(40), holderId: id.nullable(),
  location: z.enum(["HELD", "WORLD", "SURFACE", "STORAGE", "THROWN"]), position: point,
  assetId: id.nullable(), slot: z.number().int().nonnegative().nullable(), remaining: z.number().min(0).max(1),
  velocity: point.nullable(), startedAt: z.number().nullable() });
const context = {
  protocolVersion: z.literal(1), roomId: id, roomEpoch: id, connectionGeneration: id,
  layoutRevision: z.number().int().nonnegative(), controlSeq: z.number().int().nonnegative(),
  frameSeq: z.number().int().nonnegative(), serverTime: z.number().finite()
};
const state = z.object({ ...context, type: z.enum(["ROOM_SNAPSHOT", "ROOM_STATE"]), selfId: id,
  participants: z.array(participant).max(200), items: z.array(item).max(2000),
  assets: z.record(id, z.object({ open: z.boolean().optional(), on: z.boolean().optional(), wateredAt: z.number().optional(),
    production: z.object({ itemId: id, kind: z.string(), completesAt: z.number() }).passthrough().nullable().optional() }).passthrough()) });
const frame = z.object({ ...context, type: z.literal("MOVEMENT_FRAME"), participants: z.array(movement).max(200) });
const result = z.object({ type: z.literal("COMMAND_RESULT"), commandId: id, success: z.boolean(),
  code: z.string().nullable().optional(), message: z.string().nullable().optional() }).passthrough();
const error = z.object({ type: z.literal("ERROR"), code: z.string(), message: z.string(), retryable: z.boolean().optional() });
const control = z.object({ type: z.enum(["PONG", "ROOM_CLOSED"]), code: z.string().optional(), message: z.string().optional() }).passthrough();
const serverMessage = z.union([state, frame, result, error, control]);

const MESSAGES = {
  TOO_FAR: "물건에 조금 더 가까이 가 주세요.", OCCUPIED: "다른 모임원이 앉아 있는 자리예요.",
  HANDS_FULL: "손에 든 물건을 먼저 내려놓아 주세요.", STORAGE_CLOSED: "문을 먼저 열어 주세요.",
  STORAGE_EMPTY: "남아 있는 물건이 없어요.", SURFACE_FULL: "선반에 이미 물건이 있어요.",
  CUP_REQUIRED: "빈 컵을 먼저 준비해 주세요.", ITEM_REQUIRED: "이 자세에 필요한 물건을 먼저 들어 주세요.",
  ITEM_NOT_FOUND: "이 물건은 이미 옮겨졌거나 없어졌어요.", ASSET_NOT_FOUND: "가구가 바뀌었어요. 새 배치를 확인해 주세요.",
  COOLDOWN: "잠시 뒤 다시 사용할 수 있어요.", NOT_OWNER: "지금은 다른 모임원이 사용 중이에요.",
  BUSY: "앞선 동작을 처리하고 있어요.", STALE_ITEM: "물건 상태가 바뀌었어요. 다시 선택해 주세요.",
  LAYOUT_MISMATCH: "새 가구 배치를 불러오고 있어요.", ROOM_FULL: "아지트에 들어갈 수 있는 인원이 가득 찼어요.",
  LAYOUT_UPGRADE_REQUIRED: "모임장이 현재 배치를 한 번 저장하면 함께 이용할 수 있어요.",
  REALTIME_UNAVAILABLE: "아지트에 자동으로 다시 연결하고 있어요.",
  ACCESS_DENIED: "현재 모임에 들어갈 권한이 없어요.", ACCESS_EXPIRED: "입장 권한이 만료됐어요. 다시 연결해 주세요.",
  CONNECTION_REPLACED: "다른 창에서 아지트에 접속했어요.", RATE_LIMITED: "동작이 너무 빨라요. 잠시 뒤 시도해 주세요."
};

export class RoomConnectionError extends Error {
  constructor(code, message) { super(MESSAGES[code] ?? message); this.name = "RoomConnectionError"; this.code = code; }
}

export function parseRoomMessage(raw) {
  if (typeof raw !== "string" || raw.length > 2 * 1024 * 1024) throw new RoomConnectionError("INVALID_MESSAGE", "공간 상태를 읽지 못했어요.");
  let value;
  try { value = JSON.parse(raw); } catch { throw new RoomConnectionError("INVALID_MESSAGE", "공간 상태를 읽지 못했어요."); }
  const parsed = serverMessage.safeParse(value);
  if (!parsed.success) throw new RoomConnectionError("PROTOCOL_MISMATCH", "공간 연결 형식이 달라요. 새로고침해 주세요.");
  return parsed.data;
}
