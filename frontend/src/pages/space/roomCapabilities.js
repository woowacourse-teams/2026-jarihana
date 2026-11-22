import { capabilitiesFor } from "../../features/group-space/furnitureCatalog.js";
import { seatedAvatarPlacement } from "./seatedAvatar.js";
import propSurfaceAnchors from "./propSurfaceAnchors.json";

export { capabilitiesFor } from "../../features/group-space/furnitureCatalog.js";
export { portableDefinition } from "../../features/group-space/assetDefinitions.js";

const LABELS = { cup: "빈 컵", coffee: "아메리카노", latte: "라테", tea: "차", cookie: "쿠키", book: "책", camera: "카메라" };
const BOOKSHELF_PLACES = ["아래 선반 왼쪽", "아래 선반 오른쪽", "위 선반", "책장 위"];

function usableSurfaceSlotCount(kind) {
  const anchors = propSurfaceAnchors[kind];
  return Array.isArray(anchors) ? Math.min(capabilitiesFor(kind).surface?.slots ?? 0, anchors.length) : 0;
}

export function usableSurfaceAnchor(kind, slot) {
  return slot < usableSurfaceSlotCount(kind) ? propSurfaceAnchors[kind]?.[slot] : null;
}

export function availableSeat(target, position, state, room) {
  const occupied = new Set(state.participants.filter((actor) => actor.seat?.assetId === target.id).map((actor) => actor.seat.slot));
  const distance = ({ x, z }) => Math.hypot(x - position.x, z - position.z);
  return Array.from({ length: target.seatCount }, (_, slot) => seatedAvatarPlacement(target.item, slot, room))
    .filter((seat) => seat && !occupied.has(seat.slot))
    .sort((a, b) => distance(a.position) - distance(b.position))[0]?.slot;
}

export function sharedInteractionTarget(target, state) {
  if (target.sharedItem || target.bed) return target.bed ? null : target;
  const definition = capabilitiesFor(target.item?.kind ?? target.id);
  const caps = definition.capabilities;
  if (!caps.length) return target.feature && target.feature !== "light" ? target : null;
  const asset = state.assets[target.id] ?? {};
  const actor = state.participants.find((entry) => entry.memberId === state.selfId);
  const held = state.items.find((entry) => entry.id === actor?.heldItemId);
  const choices = [];
  const producing = asset.production;
  const add = (id, label, command, action) => choices.push({ id, label, command: { assetId: target.id, ...command }, action });
  if (caps.includes("openable")) add(asset.open ? "close" : "open", asset.open ? "문 닫기" : "문 열기",
    { action: asset.open ? "CLOSE" : "OPEN" }, "space_storage_toggle");
  const accessible = !caps.includes("openable") || asset.open;
  if (accessible && definition.storage) {
    if (!held) for (const kind of definition.storage.kinds) add(`take-${kind}`, `${LABELS[kind] ?? kind} 꺼내기`, { action: "TAKE", kind }, "space_item_take");
    if (held && definition.storage.kinds.includes(held.kind) &&
      state.items.filter((item) => item.assetId === target.id && item.location === "STORAGE").length < definition.storage.capacity) {
      add("return", "물건 반납", { action: "RETURN", itemId: held.id }, "space_item_return");
    }
  }
  const slots = usableSurfaceSlotCount(target.item?.kind);
  const placedItems = state.items.filter((item) => item.assetId === target.id && item.location === "SURFACE" && item.slot < slots);
  const cup = held?.kind === "cup" ? held : placedItems.find((item) => item.kind === "cup");
  if (accessible && definition.producer) {
    if (producing) add("cancel-production", `${LABELS[producing.kind] ?? "음료"} 준비 중 · 취소`, { action: "CANCEL_PRODUCTION" }, "space_production_cancel");
    else if (cup) for (const kind of definition.producer.kinds) add(`produce-${kind}`, `${LABELS[kind]} 내리기`, { action: "PRODUCE", itemId: cup.id, kind }, "space_coffee_produce");
  }
  if (slots) {
    for (let slot = 0; slot < slots; slot++) {
      const placed = placedItems.find((item) => item.slot === slot);
      const shelfLocation = target.item.kind === "bookshelf" ? BOOKSHELF_PLACES[slot] : undefined;
      const location = shelfLocation ?? (slots > 1 ? `${slot + 1}번째 자리` : "");
      if (held && !placed) {
        add(`place-${slot}`, location ? `${location}에 놓기` : "위에 놓기",
          { action: "PLACE", slot, itemId: held.id }, "space_item_place");
      } else if (!held && placed && placed.id !== producing?.itemId) {
        const name = LABELS[placed.kind] ?? "물건";
        add(`pickup-${slot}`, location ? `${location}에서 ${name} 집기` : `${name} 집기`,
          { action: "PICKUP", itemId: placed.id }, "space_item_pick_up");
      }
    }
  }
  if (caps.includes("careable")) add("water", "물 주기", { action: "WATER" }, "space_plant_water");
  if (caps.includes("switchable")) add("toggle", asset.on === false ? "조명 켜기" : "조명 끄기", { action: "TOGGLE" }, "space_general_lighting_toggle");
  if (caps.includes("camera")) add("capture", "사진 찍기", { action: "CAPTURE" }, "space_camera_capture");
  if (caps.length === 1 && caps[0] === "surface" && !choices.length) return null;
  return { ...target, choices, carry: false, hint: definition.producer && !cup ? "빈 컵을 들거나 기계 위에 놓고 사용해 주세요." : "지금 사용할 수 있는 물건이 없어요.", label: target.seatCount ? "앉기" : choices.length ? "사용하기" : target.label };
}
