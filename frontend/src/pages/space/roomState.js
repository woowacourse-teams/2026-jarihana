import { pinnedBlueprintSchema } from "../../features/group-space/api.js";
import { canAddFurniture, furnitureType } from "../../features/group-space/furnitureCatalog.js";
import { validateOutdoors } from "./roomOutdoors.js";
import { surfaceFootprint, assetScale, surfaceHeight, transformAttachedItems, validAssetCustomization } from "./assetCustomization";
import { FLOOR_MATERIALS, WALL_MATERIALS } from "./surfaceCatalog";
import { DINING_BAND_KINDS, createDiningBandPresetItems } from "./diningBandAssets";
import { LEGACY_FACILITY_KINDS, createLegacyFacilityItems } from "./legacyFacilityCatalog";
import { commonAssetStatus, commonFunctionForItem } from "./commonFunctionAssets";
import { initialRoomDocument, bindRoomBlueprint, geometryVersion, ROOM_BLUEPRINT, BUILDING, BUILDING_WALLS, CLIMBING_V5, CLIMBING_V6, BOARDGAME_V6, CLEAR_PATHS, LOUNGE_LOFT_VERSION, PLAYER, ROOM_ZONES, YARD, boundsForBox, contains, facilityBounds, getRoomLayout, overlaps } from "./roomLayout";

export { CATALOG } from "../../features/group-space/furnitureCatalog.js";

export const LOUNGE_LOFT_WRITES_ENABLED = true;
export const STORAGE_KEY = "jarihana.space-studio.v1";
export const MAX_ITEMS = 400;
export const MAX_PHOTO_LENGTH = 220000;
export const DEFAULT_ATMOSPHERE = Object.freeze({
  backgroundColor: "#ead8c9", backgroundStyle: "gradient",
  ambient: 100, sunlight: 100, warmth: 70, sunAngle: 330,
  lamps: 100, shadowSoftness: 60, shadows: true, wallColor: "", floorColor: "",
  wallMaterial: "auto", floorMaterial: "auto", wallPatternScale: 1, floorPatternScale: 1
});
export const TEMPLATE_ATMOSPHERES = Object.freeze({
  climbing: Object.freeze({ ...DEFAULT_ATMOSPHERE, backgroundColor: "#b7ada8", ambient: 55, sunlight: 60, warmth: 75, lamps: 120 }),
  boardgame: Object.freeze({ ...DEFAULT_ATMOSPHERE, backgroundColor: "#55445e", ambient: 45, sunlight: 25, warmth: 88, lamps: 135 }),
  dining: Object.freeze({ ...DEFAULT_ATMOSPHERE, backgroundColor: "#d4bca6", ambient: 50, sunlight: 65, warmth: 78, lamps: 120 }),
  band: Object.freeze({ ...DEFAULT_ATMOSPHERE, backgroundColor: "#51404f", ambient: 38, sunlight: 18, warmth: 82, lamps: 140 }),
  study: Object.freeze({ ...DEFAULT_ATMOSPHERE, backgroundColor: "#bec9d1", ambient: 95, sunlight: 90, warmth: 42, lamps: 85 }),
  photo: Object.freeze({ ...DEFAULT_ATMOSPHERE, backgroundColor: "#8b807c", ambient: 47, sunlight: 40, warmth: 77, lamps: 125 })
});
export const ATMOSPHERE_PRESETS = Object.freeze([
  { id: "cozy", name: "포근한 오후", values: DEFAULT_ATMOSPHERE },
  { id: "daylight", name: "맑은 낮", values: Object.freeze({ ...DEFAULT_ATMOSPHERE,
    backgroundColor: "#d8e7ee", ambient: 120, sunlight: 125, warmth: 25, sunAngle: 300, lamps: 35, shadowSoftness: 40 }) },
  { id: "evening", name: "늦은 저녁", values: Object.freeze({ ...DEFAULT_ATMOSPHERE,
    backgroundColor: "#81788e", ambient: 35, sunlight: 20, warmth: 90, sunAngle: 270, lamps: 140, shadowSoftness: 85 }) }
]);
export const ROOM_TEMPLATES = Object.freeze([
  { id: "lounge", name: "기본 아지트", description: "함께 쉬고 이야기하는 우리 동아리방", facility: LOUNGE_LOFT_WRITES_ENABLED ? "공동 테이블 · 작은 카페 · 2층 라운지" : "작은 카페 코너 · 소파와 공동 테이블", theme: "blue" },
  { id: "climbing", name: "클라이밍", description: "12m 높이의 홀과 암벽과 중층 라운지가 있는 우리 암장", facility: "대형 암벽 · 장비 보관 · 중층 관람 라운지", theme: "chalk" },
  { id: "boardgame", name: "보드게임", description: "게임 라이브러리와 복층 라운지에서 함께 노는 공간", facility: "보드게임 서가 · 넓은 게임 테이블 · 중층 라운지", theme: "walnut" },
  { id: "dining", name: "맛집 · 다이닝", description: "오픈 키친과 긴 식탁, 복층 카페에서 함께 먹는 아지트", facility: "주방 · 공동 식탁 · 중층 다이닝", theme: "wood" },
  { id: "band", name: "밴드", description: "함께 연주하고 머무는 우리 연습실", facility: "합주 무대 · 믹싱 데스크 · 중층 라운지", theme: "rehearsal" },
  { id: "study", name: "개발 · 스터디", description: "함께 만들고 배우는 밝은 복층 작업실", facility: "협업 데스크 · 발표 보드 · 개인 작업석", theme: "studio" },
  { id: "photo", name: "사진", description: "촬영하고 전시하고, 함께 사진을 고르는 스튜디오", facility: "촬영 배경 · 카메라 보관 · 편집과 전시", theme: "gallery" }
]);
export const ACCENT_COLORS = Object.freeze([
  { value: "#536bd6", name: "코발트" }, { value: "#7b9b6d", name: "올리브" },
  { value: "#d99559", name: "살구" }, { value: "#c991ba", name: "라일락" }, { value: "#7d8b9d", name: "스톤 블루" }
]);
export const FOOD_OPTIONS = Object.freeze([
  { id: "pizza", name: "피자" }, { id: "ramen", name: "라멘" }, { id: "dessert", name: "디저트" }
]);
export const THEMES = Object.freeze([
  { id: "blue", name: "파란 오후", floor: "#cda17b", wall: "#e5e9e4" },
  { id: "sage", name: "초록 다락", floor: "#c99c6e", wall: "#dde3ca" },
  { id: "rose", name: "복숭아빛", floor: "#cc9a7b", wall: "#f1d6c6" },
  { id: "wood", name: "따뜻한 나무", floor: "#ddba8a", wall: "#efdfbf" },
  { id: "chalk", name: "따뜻한 암장", floor: "#a9adae", wall: "#e9dfd0" },
  { id: "walnut", name: "저녁의 게임방", floor: "#c99557", wall: "#8c7765" },
  { id: "rehearsal", name: "밤의 합주실", floor: "#784538", wall: "#39323a" },
  { id: "studio", name: "밝은 작업실", floor: "#d4d9da", wall: "#c9d0d5" },
  { id: "gallery", name: "따뜻한 갤러리", floor: "#baa68a", wall: "#cbbba6" }
]);
export const AVATAR_COLORS = ["#536bd6", "#c991ba", "#7b9b6d", "#d99559"];

export function createInitialRoom(template = "lounge", options = {}) {
  const preset = initialRoomDocument(template, options);
  const available = preset.items.filter(item => canAddFurniture(item.kind, preset.version));
  const ids = new Set(available.map(item => item.id));
  // A retired support cannot receive a new prop. Existing saved rooms use readSavedRoom.
  const items = available.filter(item => !item.parentId || ids.has(item.parentId)).map(item => ({ ...item }));
  return bindRoomBlueprint({ ...preset, atmosphere: { ...preset.atmosphere }, items }, options.blueprint);
}

export function restoreCommonFunctionAssets(room) {
  const missing = commonAssetStatus(room.items).filter((entry) => !entry.items.length && canAddFurniture(entry.kind, room.version));
  if (!missing.length) return room;
  if (room.items.length + missing.length > MAX_ITEMS) throw new Error("공통 에셋을 놓을 자리가 부족해요. 가구를 정리한 뒤 다시 추가해 주세요.");
  const items = [...room.items];
  for (const asset of missing) {
    const position = findOpenPosition(asset.kind, items, room, "building");
    if (!position) throw new Error("공통 에셋을 놓을 빈자리가 부족해요. 기존 가구와 기록은 그대로 두었어요.");
    let id = `common-${asset.kind}`;
    while (items.some((item) => item.id === id)) id = `new-${id}`;
    items.push({ id, kind: asset.kind, x: position.x, z: position.z, rotation: 0, level: position.level });
  }
  return { ...room, items };
}

export function applyRoomTemplate(room, templateId, blueprint) {
  if (!ROOM_TEMPLATES.some((entry) => entry.id === templateId)) throw new Error("아지트를 골라 주세요.");
  const fresh = createInitialRoom(templateId, { blueprint });
  const memories = room.items.filter((item) => item.kind === "memory");
  if (fresh.items.length + memories.length > MAX_ITEMS) throw new Error("추억을 모두 옮길 자리가 부족해요. 액자를 정리한 뒤 다시 골라 주세요.");
  const memoryIds = new Set(memories.map((item) => item.id));
  const renamed = new Map(fresh.items.map((item) => {
    let id = item.id;
    while (memoryIds.has(id)) id = `new-${id}`;
    return [item.id, id];
  }));
  const items = fresh.items.map((item) => ({ ...item, id: renamed.get(item.id),
    ...(item.parentId ? { parentId: renamed.get(item.parentId) } : {}) }));
  for (const memory of memories) {
    const position = canPlace(memory, items, fresh) ? memory : findOpenPosition("memory", items, fresh);
    if (!position) throw new Error("추억을 모두 옮길 자리가 부족해요. 액자를 정리한 뒤 다시 골라 주세요.");
    items.push({ ...memory, ...position, rotation: position.rotation ?? 0 });
  }
  return { ...room, ...(blueprint && { [ROOM_BLUEPRINT]: blueprint }), version: fresh.version, template: templateId, theme: fresh.theme,
    matColor: templateId === "climbing" ? fresh.matColor : room.matColor, atmosphere: TEMPLATE_ATMOSPHERES[templateId] ? { ...fresh.atmosphere, ...(room.atmosphere.outdoors && { outdoors: room.atmosphere.outdoors }) } : room.atmosphere, items };
}

export const assetType = (item) => furnitureType(item.kind);
export const isUnderlay = (item) => Boolean(assetType(item)?.underlay || assetType(item)?.walkableHeight);
export const isMounted = (item) => Boolean(assetType(item)?.mount);
const isRug = isUnderlay;

function supportHeight(item, items) {
  if (isUnderlay(item) || isMounted(item) || assetType(item)?.connectedSurface) return 0;
  const bounds = boundsForBox({ ...item, ...footprint(item) });
  return items.reduce((height, other) => other.id !== item.id && (other.level || 0) === (item.level || 0) &&
    assetType(other)?.walkableHeight && contains(boundsForBox({ ...other, ...footprint(other) }), bounds)
    ? Math.max(height, assetType(other).walkableHeight * (other.scaleY || 1)) : height, 0);
}

export function placedItemElevation(item, room) {
  const base = item.level === 1 ? getRoomLayout(room).mezzanine?.height || 0 : 0;
  const parent = item.parentId && room.items.find((other) => other.id === item.parentId);
  return parent ? placedItemElevation(parent, room) + surfaceHeight(parent, item.surfaceIndex) : base + (item.elevation || 0) + supportHeight(item, room.items);
}

function fitsVerticalSpace(item, items, layout) {
  const bounds = boundsForBox({ ...item, ...footprint(item) });
  const parent = item.parentId && items.find((other) => other.id === item.parentId);
  const base = parent ? surfaceHeight(parent, item.surfaceIndex) + (parent.elevation || 0) + supportHeight(parent, items) : (item.elevation || 0) + supportHeight(item, items);
  const top = base + (assetType(item)?.height || 0) * (item.scaleY || 1);
  const ceiling = layout.building.height - (item.level === 1 ? layout.mezzanine.height : 0);
  if (top > ceiling + 0.02) return false;
  // Wall and ceiling assets may sit above the loft, but never through its slab.
  if (!item.level && layout.mezzanine && overlaps(bounds, layout.mezzanine) &&
    base < layout.mezzanine.height && top > layout.mezzanine.height - 0.3 + 0.02) return false;
  if (isUnderlay(item) || isMounted(item) || assetType(item)?.connectedSurface) return true;
  // A furniture base must sit entirely on a platform or entirely off it.
  return !items.some((other) => other.id !== item.id && (other.level || 0) === (item.level || 0) &&
    assetType(other)?.walkableHeight && overlaps(bounds, boundsForBox({ ...other, ...footprint(other) })) &&
    !contains(boundsForBox({ ...other, ...footprint(other) }), bounds));
}

export function footprint(item, version = 9) {
  const type = version < 7 && item.kind === "gameTable" ? { width: 3.2, depth: 1.9 } : furnitureType(item.kind);
  const scale = assetScale(item);
  const width = type.width * scale.x, depth = type.depth * scale.z;
  return { ...type, width: item.rotation % 2 ? depth : width, depth: item.rotation % 2 ? width : depth };
}

function overlapsFurniture(item, items, version = 9) {
  if (isRug(item) || isMounted(item)) return false;
  const size = footprint(item, version);
  return items.some((other) => {
    if (item.parentId && other.id === item.parentId || other.parentId && other.parentId === item.id) return false;
    if (Boolean(item.parentId) !== Boolean(other.parentId) || item.parentId && (item.parentId !== other.parentId || (item.surfaceIndex || 0) !== (other.surfaceIndex || 0))) return false;
    if (other.id === item.id || isRug(other) || isMounted(other) || (other.level || 0) !== (item.level || 0)) return false;
    if (assetType(item)?.connectedSurface && assetType(other)?.connectedSurface) return false;
    const otherSize = footprint(other, version);
    return Math.abs(item.x - other.x) < (size.width + otherSize.width) / 2 - 0.02 &&
      Math.abs(item.z - other.z) < (size.depth + otherSize.depth) / 2 - 0.02;
  });
}

function canPlaceInLayout(item, items, layout, facilities, version = 9, keepSavedPlacement = false) {
  const level = item.level ?? 0;
  if (!validAssetCustomization(item)) return false;
  if (item.parentId) {
    const parent = items.find((other) => other.id === item.parentId);
    if (!assetType(item)?.prop || !parent || parent.parentId || (parent.level || 0) !== level ||
      assetType(parent)?.surfaces[item.surfaceIndex || 0] === undefined || item.elevation) return false;
    if (!keepSavedPlacement && !contains(boundsForBox(surfaceFootprint(parent, item.surfaceIndex || 0, assetType(parent))), boundsForBox({ ...item, ...footprint(item) }))) return false;
  } else if (item.surfaceIndex !== undefined || !keepSavedPlacement && item.elevation && !isMounted(item)) return false;
  if (![0, 1].includes(level) || (level === 1 && !layout.mezzanine)) return false;
  if (keepSavedPlacement) return Math.abs(item.x) <= 64 && Math.abs(item.z) <= 64;
  const bounds = boundsForBox({ ...item, ...footprint(item, version) });
  const areas = level === 1 ? [layout.mezzanine] : [layout.building, ...(layout.exterior || [layout.entrance])];
  const placementAreas = isMounted(item) ? areas.map((area) => ({ ...area,
    minX: area.minX - 0.15, maxX: area.maxX + 0.15, minZ: area.minZ - 0.15, maxZ: area.maxZ + 0.15 })) : areas;
  if (!placementAreas.some((area) => contains(area, bounds))) return false;
  const obstacles = [...layout.walls, ...(layout.pillars || []), ...(level === 1 ? layout.railings || [] : layout.terrace?.fixtures || [])];
  if (!isMounted(item) && !isUnderlay(item) && obstacles.some((wall) => overlaps(bounds, boundsForBox(wall), 0.08))) return false;
  if (version >= 9) {
    const nextItems = [...items.filter((other) => other.id !== item.id), item];
    if (!fitsVerticalSpace(item, nextItems, layout)) return false;
    if (assetType(item)?.walkableHeight && items.some((other) => other.id !== item.id &&
      (other.level || 0) === level && !fitsVerticalSpace(other, nextItems, layout))) return false;
  }
  if (!isMounted(item) && layout.stairs && overlaps(bounds, layout.stairs, 0.08)) return false;
  if (level === 0 && facilities.some((area) => overlaps(bounds, area))) return false;
  const paths = level === 1 ? layout.mezzaninePaths : layout.clearPaths;
  if (!isRug(item) && !isMounted(item) && paths.some((area) => overlaps(bounds, area))) return false;
  return !overlapsFurniture(item, items, version);
}

export function canPlace(item, items, template = "lounge") {
  const previous = items.find((entry) => entry.id === item.id);
  const nextItems = previous ? transformAttachedItems(items, item.id, item) : [...items, item];
  return [item, ...nextItems.filter((entry) => entry.parentId === item.id)].every((entry) =>
    canPlaceInLayout(entry, nextItems, getRoomLayout(template), facilityBounds(template, true), template?.[ROOM_BLUEPRINT] ? template.version : undefined));
}
function legacyLayout(layout) {
  return { ...layout, entrance: YARD, clearPaths: layout.clearPaths.map((path) => ({ ...path,
    maxZ: path.maxZ === 8.2 ? 12.5 : path.maxZ })) };
}

function canPlaceVersion9(item, items, template) {
  return canPlaceInLayout(item, items, getRoomLayout(template, 9), facilityBounds(template, true, 9), 9);
}

function canPlaceVersion8(item, items, template) {
  return canPlaceInLayout(item, items, getRoomLayout(template, 8), facilityBounds(template, true, 8), 8);
}

function canPlaceVersion7(item, items, template) {
  return canPlaceInLayout(item, items, legacyLayout(getRoomLayout(template, 8)), facilityBounds(template, true, 8), 7);
}

function canPlaceVersion6(item, items, template) {
  const layout = template === "climbing" ? CLIMBING_V6 : template === "boardgame" ? BOARDGAME_V6 : getRoomLayout(template, 8);
  return canPlaceInLayout(item, items, legacyLayout(layout), layout.facilityPlacement || facilityBounds(template, true, 8), 6);
}

function canPlaceVersion5(item, items, template) {
  return template === "climbing"
    ? canPlaceInLayout(item, items, { ...CLIMBING_V5, entrance: YARD }, CLIMBING_V5.facilityPlacement, 5)
    : canPlaceInLayout(item, items, legacyLayout(getRoomLayout(template, 8)), facilityBounds(template, true, 8), 5);
}

function canPlaceVersion4(item, items, template) {
  const bounds = boundsForBox({ ...item, ...footprint(item) });
  if (![BUILDING, YARD].some((area) => contains(area, bounds))) return false;
  if (BUILDING_WALLS.some((wall) => overlaps(bounds, boundsForBox(wall), 0.08))) return false;
  const facilities = template === "climbing"
    ? [{ minX: -9.6, maxX: 3.5, minZ: -7.9, maxZ: -4.6 }]
    : facilityBounds(template, true, 8);
  if (facilities.some((area) => overlaps(bounds, area))) return false;
  if (!isRug(item) && CLEAR_PATHS.some((area) => overlaps(bounds, area))) return false;
  return !overlapsFurniture(item, items);
}

// Validate old geometry before migration; corrupt old saves must not be repaired into valid rooms.
function canPlaceLegacy(item, items, template) {
  const { width, depth } = footprint(item);
  if (Math.abs(item.x) + width / 2 > 6.7 || Math.abs(item.z) + depth / 2 > 4.2) return false;
  const corner = template === "climbing" ? { x: 2, z: -2 } : { x: 3.8, z: -2.6 };
  if (item.x + width / 2 > corner.x && item.z - depth / 2 < corner.z) return false;
  if (item.x - width / 2 < -4.5 && item.z + depth / 2 > 3.3) return false;
  if ([[-6.45, -3.65], [6.38, 3.65]].some(([x, z]) =>
    Math.abs(item.x - x) < width / 2 + 0.36 && Math.abs(item.z - z) < depth / 2 + 0.36)) return false;
  return !overlapsFurniture(item, items);
}

export function snapPosition(value) { return Math.round(value * 4) / 4; }

export function findOpenPosition(kind, items, template = "lounge", region, rotation = 0, customization = {}, accepts = () => true) {
  const layout = getRoomLayout(template);
  const level = region === "mezzanine" ? 1 : 0;
  if (level === 1 && !layout.mezzanine) return null;
  const preferred = region === "mezzanine" ? layout.mezzanine :
    ["building", "ground"].includes(region) ? layout.building : region === "entrance" ? layout.entrance : region === "yard" ? layout.yard :
      typeof region === "string" ? ROOM_ZONES.find((entry) => entry.id === region) : region;
  if (typeof region === "string" && !preferred) return null;
  const areas = preferred ? [preferred] : [layout.building, ...(layout.exterior || [layout.entrance])];
  const commonPaths = commonFunctionForItem({ kind }) ? (level === 1 ? layout.mezzaninePaths : layout.clearPaths) : [];
  for (const area of areas) {
    for (let z = area.maxZ - 0.5; z >= area.minZ + 0.5; z -= 0.5) {
      for (let x = area.minX + 0.5; x <= area.maxX - 0.5; x += 0.5) {
        const item = { ...customization, kind, x, z, rotation, level };
        const bounds = boundsForBox({ ...item, ...footprint(item) });
        if (commonPaths.some((path) => overlaps(bounds, path, PLAYER.radius + 0.1))) continue;
        if (contains(area, bounds) && canPlace(item, items, template) && accepts(item)) return { x, z, level };
      }
    }
  }
  return null;
}

function migrateItems(items, template) {
  // Keep every still-valid position first so relocated pieces do not displace unrelated furniture.
  const fixed = items.filter((item) => canPlace(item, items, template));
  const result = new Map(fixed.map((item) => [item.id, item]));
  for (const item of items) {
    if (result.has(item.id)) continue;
    const position = (item.level === 1 ? findOpenPosition(item.kind, [...result.values()], template, "mezzanine", item.rotation) :
      item.z > 5 ? findOpenPosition(item.kind, [...result.values()], template, "entrance", item.rotation) : null) ||
      findOpenPosition(item.kind, [...result.values()], template, undefined, item.rotation);
    if (!position) return null;
    result.set(item.id, { ...item, ...position });
  }
  return items.map((item) => result.get(item.id));
}

function migrateLoungeItems(items, room) {
  const layout = getRoomLayout(room);
  const roots = items.filter((item) => !item.parentId);
  const groupFor = (root) => [root, ...items.filter((item) => item.parentId === root.id)];
  const placed = new Map();
  const addGroup = (group) => group.forEach((item) => placed.set(item.id, item));

  for (const root of roots) {
    const group = groupFor(root);
    if (group.every((item) => canPlaceInLayout(item, items, layout, [], room.version))) addGroup(group);
  }
  for (const root of roots) {
    if (placed.has(root.id)) continue;
    const group = groupFor(root);
    const occupied = [...placed.values()];
    const fits = (position) => {
      const moved = transformAttachedItems(group, root.id, position);
      return moved.every((item) => canPlaceInLayout(item, [...occupied, ...moved], layout, [], room.version));
    };
    const preferred = root.z > layout.building.maxZ ? "entrance" : "building";
    const position = findOpenPosition(root.kind, occupied, room, preferred, root.rotation, root, fits) ||
      findOpenPosition(root.kind, occupied, room, undefined, root.rotation, root, fits);
    if (!position) return null;
    addGroup(transformAttachedItems(group, root.id, position));
  }
  return items.map((item) => placed.get(item.id));
}

export function isSafeRecordLink(value) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function isRoomPhoto(value) {
  return value === "" || (typeof value === "string" && value.length <= MAX_PHOTO_LENGTH &&
    /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}

function validateAtmosphere(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const color = (entry) => typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry);
  if (!color(value.backgroundColor) || !["gradient", "solid"].includes(value.backgroundStyle) ||
    typeof value.shadows !== "boolean" ||
    ![value.wallColor, value.floorColor].every((entry) => entry === "" || color(entry))) return null;
  const limits = { ambient: 150, sunlight: 150, warmth: 100, sunAngle: 360, lamps: 150, shadowSoftness: 100 };
  if (Object.entries(limits).some(([key, max]) => !Number.isFinite(value[key]) || value[key] < 0 || value[key] > max)) return null;
  const normalized = { ...DEFAULT_ATMOSPHERE, ...value };
  if (!WALL_MATERIALS.some(({ id }) => id === normalized.wallMaterial) ||
    !FLOOR_MATERIALS.some(({ id }) => id === normalized.floorMaterial) ||
    [normalized.wallPatternScale, normalized.floorPatternScale].some((scale) => !Number.isFinite(scale) || scale < 0.5 || scale > 2)) return null;
  const atmosphere = Object.fromEntries(Object.keys(DEFAULT_ATMOSPHERE).map((key) => [key, normalized[key]]));
  if (value.outdoors === undefined) return atmosphere;
  const outdoors = validateOutdoors(value.outdoors);
  return outdoors ? { ...atmosphere, outdoors } : null;
}

const PLACEMENT_FIELDS = ["kind", "x", "z", "rotation", "level", "scaleX", "scaleY", "scaleZ", "elevation", "parentId", "surfaceIndex"];

export function validateRoom(value, { preserveVersion = Boolean(value?.[ROOM_BLUEPRINT]), savedRoom } = {}) {
  if (!value || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, LOUNGE_LOFT_VERSION].includes(value.version) || typeof value.name !== "string" ||
    !value.name.trim() || value.name.length > 30 || !THEMES.some((t) => t.id === value.theme) ||
    !AVATAR_COLORS.includes(value.avatarColor) || !Array.isArray(value.items) || value.items.length > (value.version < 7 ? 48 : value.version < 9 ? 64 : value.version === 9 ? 160 : MAX_ITEMS)) return null;
  const template = value.template ?? "lounge";
  if (value.version === LOUNGE_LOFT_VERSION && template !== "lounge") return null;
  const accentColor = value.accentColor ?? ACCENT_COLORS[0].value;
  const matColor = value.matColor ?? ACCENT_COLORS[1].value;
  const food = value.food ?? "pizza";
  const coverPhoto = value.coverPhoto ?? "";
  const notice = value.notice ?? "";
  const atmosphere = value.version < 3 && value.atmosphere === undefined ? { ...DEFAULT_ATMOSPHERE } : validateAtmosphere(value.atmosphere);
  if (!ROOM_TEMPLATES.some((entry) => entry.id === template) || (value.version < 4 && template === "band") || (value.version < 6 && template === "boardgame") || (value.version < 9 && ["study", "photo"].includes(template)) ||
    ![accentColor, matColor].every((color) => ACCENT_COLORS.some((entry) => entry.value === color)) ||
    !FOOD_OPTIONS.some((entry) => entry.id === food) || !isRoomPhoto(coverPhoto) ||
    typeof notice !== "string" || notice.length > 100 || !atmosphere) return null;
  // Existing server placements can predate the editor's collision rules. Check all new and moved furniture.
  const savedItems = new Map(savedRoom?.items?.map(item => [item?.id, item]));
  const sameLayout = value[ROOM_BLUEPRINT] && savedRoom?.template === template && savedRoom.version === value.version &&
    geometryVersion(savedRoom) === geometryVersion(value);
  const ids = new Set();
  const items = [];
  for (const item of value.items) {
    const type = item && assetType(item);
    if (!type || typeof item.id !== "string" || !item.id || item.id.length > 80 || ids.has(item.id) ||
      (preserveVersion && type.minRoomVersion > value.version) ||
      (!type.placeable && savedItems.get(item.id)?.kind !== item.kind) ||
      (value.version < 7 && ["roundChair", "clubSofa", "gameCredenza", "loungeRug"].includes(item.kind)) ||
      !Number.isFinite(item.x) || !Number.isFinite(item.z) ||
      (item.level !== undefined && (![0, 1].includes(item.level) || (item.level === 1 && (value.version < 5 || !getRoomLayout(value).mezzanine)))) ||
      !Number.isInteger(item.rotation) || item.rotation < 0 || item.rotation > 3 ||
      (item.title !== undefined && (typeof item.title !== "string" || item.title.length > 40)) ||
      (item.note !== undefined && (typeof item.note !== "string" || item.note.length > 500)) ||
      (item.color !== undefined && (typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color)))) return null;
    if (!validAssetCustomization(item)) return null;
    ids.add(item.id);
    const clean = { id: item.id, kind: item.kind, x: item.x, z: item.z, rotation: item.rotation };
    for (const key of ["scaleX", "scaleY", "scaleZ", "elevation", "finish", "variant", "parentId", "surfaceIndex", "title", "note"])
      if (item[key] !== undefined) clean[key] = item[key];
    if (item.level !== undefined) clean.level = item.level;
    if (item.color !== undefined) clean.color = item.color;
    if (item.kind === "memory") {
      if (!isRoomPhoto(item.photo ?? "") || !isSafeRecordLink(item.link ?? "")) return null;
      if (item.photo !== undefined) clean.photo = item.photo;
      if (item.link !== undefined) clean.link = item.link;
      if (!preserveVersion) {
        clean.title ??= "추억 액자";
        clean.note ??= "";
        clean.photo ??= "";
        clean.link ??= "";
      }
    }
    const validPlacement = value.version < 4 ? canPlaceLegacy : value.version === 4 ? canPlaceVersion4 : value.version === 5 ? canPlaceVersion5 : value.version === 6 ? canPlaceVersion6 : value.version === 7 ? canPlaceVersion7 : value.version === 8 ? canPlaceVersion8 : value.version === 9 ? canPlaceVersion9 : canPlace;
    const candidates = value.version >= 9 ? value.items : items;
    const saved = savedItems.get(clean.id);
    const keepPlacement = sameLayout && saved && PLACEMENT_FIELDS.every(key => clean[key] === saved[key]);
    const placed = value[ROOM_BLUEPRINT] ? canPlaceInLayout(clean, candidates, getRoomLayout(value), facilityBounds(value, true), value.version, keepPlacement) :
      validPlacement(clean, candidates, value.version >= 10 ? value : template);
    if (!placed) return null;
    items.push(clean);
  }
  let migrated = !preserveVersion && value.version < 10 ? migrateItems(items, { template, version: 10 }) : items;
  if (migrated && !preserveVersion && value.version < 9) {
    const facilities = ["dining", "band"].includes(template)
      ? createDiningBandPresetItems(template).filter(({ kind }) => DINING_BAND_KINDS.includes(kind) || LEGACY_FACILITY_KINDS.includes(kind))
      : createLegacyFacilityItems(template);
    const ids = new Set(migrated.map((entry) => entry.id));
    for (const fixture of facilities.filter(item => canAddFurniture(item.kind, 10))) {
      let id = fixture.id;
      while (ids.has(id)) id = `fixture-${id}`;
      ids.add(id);
      const position = canPlace(fixture, migrated, { template, version: 10 }) ? fixture : findOpenPosition(fixture.kind, migrated, { template, version: 10 },
        fixture.level === 1 ? "mezzanine" : "building", fixture.rotation);
      if (!position) return null;
      migrated.push({ ...fixture, ...position, id });
    }
  }
  if (!migrated) return null;
  return bindRoomBlueprint({ version: preserveVersion ? value.version : Math.max(10, value.version), template, name: value.name, theme: value.theme, avatarColor: value.avatarColor,
    accentColor, matColor, food, coverPhoto, notice, atmosphere, items: migrated }, value[ROOM_BLUEPRINT]);
}

// Former positions are required only when upgrading a browser-local v11 save.
const PRESET_MUSIC_POSITIONS = {
  climbing: { x: 8.5, z: -1.75, rotation: 0 },
  band: { x: 7.5, z: 0.75, rotation: 0 },
  dining: { x: 4.25, z: 2.5, rotation: 0 },
  boardgame: { x: 10, z: 0.25, rotation: 3 },
  study: { x: 5, z: 0.75, rotation: 0 },
  photo: { x: 3, z: 2.5, rotation: 0 }
};

export function readSavedRoom(value, { preserveVersion = false } = {}) {
  const room = validateRoom(value, { preserveVersion, savedRoom: value });
  if (preserveVersion) return room;
  if (LOUNGE_LOFT_WRITES_ENABLED && room?.template === "lounge" && room.version < LOUNGE_LOFT_VERSION) {
    const loft = { ...room, version: LOUNGE_LOFT_VERSION };
    const items = migrateLoungeItems(room.items, loft);
    return items ? { ...loft, items } : room;
  }
  if (room?.version !== 11) return room;
  const position = PRESET_MUSIC_POSITIONS[room.template];
  if (!position) return room;
  const { building } = getRoomLayout(room);
  // Match the former preset pose so custom placements and older layouts are preserved.
  const music = room.items.find((item) => item.id === "music-console" && item.kind === "musicConsole" &&
    item.x === building.maxX - 3.3 && item.z === 6.8 && item.rotation === 0 && (item.level ?? 0) === 0);
  if (!music) return room;
  let next = { ...music, ...position };
  if (!canPlace(next, room.items, room)) {
    const open = findOpenPosition(music.kind, room.items, room, "building", position.rotation, music);
    if (!open) return room;
    next = { ...next, x: open.x, z: open.z };
  }
  return { ...room, items: room.items.map((item) => item.id === music.id ? next : item) };
}

export function loadRoom(storage, blueprint) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { room: createInitialRoom("lounge", { blueprint }), warning: "" };
    const { blueprint: storedBlueprint, ...document } = JSON.parse(raw);
    const pinned = storedBlueprint && pinnedBlueprintSchema.parse(storedBlueprint);
    if (pinned && pinned.blueprintRef.templateKey !== document.template) throw new Error("Invalid room blueprint");
    const room = readSavedRoom(bindRoomBlueprint(document, pinned), { preserveVersion: Boolean(pinned) });
    if (!room) throw new Error("Invalid room");
    return { room, warning: "" };
  } catch {
    return { room: createInitialRoom("lounge", { blueprint }), warning: "저장한 공간을 읽지 못했어요. 기본 공간을 열었습니다." };
  }
}

export function saveRoom(storage, room, savedRoom) {
  const valid = validateRoom(room, { savedRoom });
  if (!valid) throw new Error("공간 배치를 확인해 주세요.");
  // A standalone save keeps the immutable published geometry even if the template default later changes.
  const blueprint = valid[ROOM_BLUEPRINT];
  const stored = blueprint ? { ...valid, blueprint: {
    blueprintRef: blueprint.blueprintRef, geometry: blueprint.geometry, spawn: blueprint.spawn
  } } : valid;
  storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return valid;
}

export function sameRoom(first, second) {
  return geometryVersion(first) === geometryVersion(second) && JSON.stringify(first) === JSON.stringify(second);
}

export function historyReducer(state, action) {
  if (action.type === "preview") return sameRoom(state.present, action.room) ? state : { ...state, present: action.room };
  if (action.type === "commit") return !action.before || sameRoom(action.before, state.present) ? state :
    { past: [...state.past.slice(-39), action.before], present: state.present, future: [] };
  if (action.type === "change") return sameRoom(state.present, action.room) ? state :
    { past: [...state.past.slice(-39), state.present], present: action.room, future: [] };
  if (action.type === "reset") return { past: [], present: action.room, future: [] };
  if (action.type === "undo" && state.past.length) return {
    past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future]
  };
  if (action.type === "redo" && state.future.length) return {
    past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1)
  };
  return state;
}
