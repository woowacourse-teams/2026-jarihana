import { Box3, Vector3 } from "three";
import { featureForRoomItem, ROOM_LIGHT_SWITCH_ID, ROOM_LIGHT_TOGGLE_ACTION } from "./clubhouseInteractions";
import { boundsForBox, getRoomLayout, PLAYER } from "./roomLayout";
import { isWalkablePosition, moveWalker } from "./roomNavigation";
import { footprint } from "./roomState";
import { capabilitiesFor } from "./roomCapabilities.js";

const FEATURE_LABELS = { dashboard: "공지 읽기", activities: "활동 기록 보기", info: "모임 정보 보기", music: "음악 열기" };
const WATER = { id: "water", label: "물 주기", action: "space_plant_water" };
const FLOWER_CHOICES = [
  { id: "flowerPink", label: "분홍색", color: "#f58aaa" },
  { id: "flowerYellow", label: "노란색", color: "#ffd872" },
  { id: "flowerPurple", label: "보라색", color: "#b495f0" }
].map((choice) => ({ ...choice, action: "space_flower_color_change" }));
const DRINKS = [
  { id: "coffee", label: "아메리카노", action: "space_pick_coffee" },
  { id: "latte", label: "라테", action: "space_pick_latte" }
];
const SNACK_CHOICES = [
  { id: "tea", label: "차", action: "space_pick_tea" },
  { id: "cookie", label: "쿠키", action: "space_pick_cookie" }
];
export const SEATED_CHOICES = [
  { id: "cup", label: "컵 들기", action: "space_seat_hold_cup" },
  { id: "book", label: "책 읽기", action: "space_seat_read" },
  { id: "empty", label: "편히 앉기", action: "space_seat_relax" }
];
export const GARDEN_CHOICES = [WATER, ...FLOWER_CHOICES];

export function itemInteraction(item, elevation, occupied, room) {
  const definition = capabilitiesFor(item.kind);
  const seat = definition.seats?.length ? [definition.seats.map((entry) => entry.x), definition.seats[0].y] : null;
  const feature = featureForRoomItem(item);
  const plant = definition.capabilities.includes("careable");
  const coffee = Boolean(definition.producer), snacks = definition.storage?.kinds.includes("cookie");
  if (occupied && seat && !feature && definition.capabilities.every((capability) => capability === "seatable")) return null;
  if (!seat && !feature && !definition.capabilities.length) return null;
  const { width, depth, height, name } = footprint(item, room.version);
  return {
    id: item.id, item, name, x: item.x, z: item.z, width, depth, floor: seat ? elevation : item.level === 1 ? getRoomLayout(room).mezzanine?.height || 0 : 0,
    minY: elevation, maxY: elevation + height * (item.scaleY || 1),
    label: seat ? "앉기" : feature ? FEATURE_LABELS[feature] : plant ? "화분 돌보기" : coffee ? "커피 내리기" : snacks ? "간식 고르기" : "사용하기",
    action: seat ? "space_seat_sit" : undefined,
    sharedOnly: !seat && !feature && !plant && !coffee && !snacks,
    feature, seat, carry: coffee || snacks,
    choices: plant ? (item.kind === "plant" ? GARDEN_CHOICES : [WATER]) : [...(coffee ? DRINKS : []), ...(snacks ? SNACK_CHOICES : [])]
  };
}

export function lightInteraction(position) {
  return {
    id: ROOM_LIGHT_SWITCH_ID, ...position, floor: 0, width: 0.23, depth: 0.09,
    minY: position.y - 0.195, maxY: position.y + 0.195,
    label: "전체 조명 전환", action: ROOM_LIGHT_TOGGLE_ACTION, feature: "light"
  };
}

const wallBounds = new WeakMap();
const targetBounds = new Box3();
const hit = new Vector3();

export function aimedInteraction(targets, position, sight, room) {
  let nearest = null, nearestDistance = Infinity;
  for (const target of targets) {
    if (Math.abs(target.floor - (position.y || 0)) > 1.2) continue;
    const dx = target.x - position.x, dz = target.z - position.z;
    const distance = Math.hypot(Math.max(0, Math.abs(dx) - target.width / 2), Math.max(0, Math.abs(dz) - target.depth / 2));
    if (distance > 1.7) continue;
    const { minX, maxX, minZ, maxZ } = boundsForBox(target);
    targetBounds.min.set(minX, target.minY, minZ);
    targetBounds.max.set(maxX, target.maxY, maxZ);
    if (!sight.intersectBox(targetBounds, hit)) continue;
    const hitDistance = targetBounds.containsPoint(sight.origin) ? 0 : sight.origin.distanceToSquared(hit);
    if (hitDistance < nearestDistance) {
      nearest = target;
      nearestDistance = hitDistance;
    }
  }
  if (!nearest) return null;

  // Use the room plan for occlusion so walking never has to raycast the furnished scene.
  if (!wallBounds.has(room)) {
    wallBounds.set(room, getRoomLayout(room).walls.map((wall) => {
      const { minX, maxX, minZ, maxZ } = boundsForBox(wall);
      return new Box3(new Vector3(minX, 0, minZ), new Vector3(maxX, wall.height ?? Infinity, maxZ));
    }));
  }
  for (const wall of wallBounds.get(room)) {
    if (sight.intersectBox(wall, hit) && sight.origin.distanceToSquared(hit) < nearestDistance) return null;
  }
  return nearest;
}

export function nearestSeat(target, position, room) {
  const { item, floor } = target;
  const { seats } = capabilitiesFor(item.kind);
  const angle = item.rotation * Math.PI / 2;
  const c = Math.cos(angle), s = Math.sin(angle);
  const sx = item.scaleX || 1, sy = item.scaleY || 1, sz = item.scaleZ || 1;
  const depth = (item.rotation % 2 ? target.width : target.depth) / 2;
  const width = (item.rotation % 2 ? target.depth : target.width) / 2;
  const point = (x, z) => ({ x: item.x + x * c + z * s, y: floor, z: item.z - x * s + z * c });
  const distance = (point) => Math.hypot(point.x - position.x, point.z - position.z);
  const clearance = PLAYER.radius + 0.08;
  const seatOffsets = seats.map((seat, slot) => ({ x: seat.x * sx, slot }))
    .sort((a, b) => distance(point(a.x, 0)) - distance(point(b.x, 0)));
  for (const { x, slot } of seatOffsets) {
    const approach = [point(x, depth + clearance), point(-width - clearance, 0), point(width + clearance, 0),
      point(x, -depth - clearance)]
      .filter((candidate) => isWalkablePosition(candidate, room))
      .sort((a, b) => distance(a) - distance(b))
      .find((candidate) => {
        const delta = { x: candidate.x - position.x, z: candidate.z - position.z };
        if (Math.hypot(delta.x, delta.z) > 2.2) return false;
        const reached = moveWalker(position, delta, room);
        return Math.hypot(reached.x - candidate.x, reached.z - candidate.z) < 0.04;
      });
    if (approach) {
      const seat = seats[slot];
      return { approach, slot, position: { ...point(x, seat.z * sz), y: floor + seat.y * sy + seat.avatarOffsetY }, yaw: Math.PI - angle };
    }
  }
  return null;
}
