import { getIslandLayout } from "./islandLayout";
import { CURRENT_LAYOUTS } from "./themeLayouts";
import { REFERENCE_LAYOUTS } from "./referenceArchitecture";
import { DINING_BAND_LAYOUTS } from "./diningBandAssets";
import { STUDY_PHOTO_LAYOUTS } from "./studyPhotoAssets";

// World units are metres. Rendering, furniture placement and walking share this plan.
export const BUILDING = Object.freeze({ minX: -10, maxX: 10, minZ: -8, maxZ: 5, height: 6.4, wingHeight: 4.2 });
export const LOUNGE_LOFT_VERSION = 12;
const LOUNGE_BUILDING = Object.freeze({ ...BUILDING, minX: -15, height: 7.6 });
// Legacy exterior bounds are retained only for saved-room validation.
export const YARD = Object.freeze({ minX: -11, maxX: 11, minZ: 5, maxZ: 12.5 });
export const STREET = Object.freeze({ minX: -14, maxX: 14, minZ: 12.5, maxZ: 16 });
export const ENTRANCE = Object.freeze({ minX: -10, maxX: 10, minZ: 5, maxZ: 8.2 });
export const PLAYER = Object.freeze({ radius: 0.3, eyeHeight: 1.45, height: 1.7, speed: 3.4, spawn: { x: -2, z: 6.8 } });
export const ROOM_ZONES = Object.freeze([
  { id: "hall", name: "메인홀", minX: BUILDING.minX, maxX: 4, minZ: -8, maxZ: 5 },
  { id: "studio", name: "작은 모임방", minX: 4, maxX: 10, minZ: -8, maxZ: -1.5 },
  { id: "lounge", name: "휴게실", minX: 4, maxX: 10, minZ: -1.5, maxZ: 5 },
  { id: "entrance", name: "입구 복도", ...ENTRANCE }
]);
function loungeWalls({ minX, minZ, maxZ, height, wingHeight }) {
  const depth = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;
  return [
    { x: (minX + 4) / 2, z: minZ, width: 4.2 - minX, depth: 0.24, height },
    { x: 7, z: minZ, width: 6, depth: 0.24, height: wingHeight },
    { x: minX, z: centerZ, width: 0.24, depth, height },
    { x: 10, z: centerZ, width: 0.24, depth, height: wingHeight, cutaway: true },
    { x: (minX - 3.5) / 2, z: maxZ, width: -3.5 - minX, depth: 0.24, height, cutaway: true },
    { x: 1.75, z: maxZ, width: 4.5, depth: 0.24, height, cutaway: true },
    { x: 7, z: maxZ, width: 6, depth: 0.24, height: wingHeight, cutaway: true },
    { x: 4, z: -6.75, width: 0.2, depth: 2.5, height: wingHeight },
    { x: 4, z: -1.25, width: 0.2, depth: 4.5, height: wingHeight },
    { x: 4, z: 4, width: 0.2, depth: 2, height: wingHeight },
    { x: 7, z: -1.5, width: 6, depth: 0.2, height: wingHeight }
  ];
}
export const BUILDING_WALLS = Object.freeze(loungeWalls(BUILDING));
const LOUNGE_WALLS = Object.freeze(loungeWalls(LOUNGE_BUILDING));
export const CLEAR_PATHS = Object.freeze([
  { minX: -3.25, maxX: -0.75, minZ: -4.5, maxZ: 12.5 },
  { minX: -0.75, maxX: 5, minZ: -5.3, maxZ: -3.7 },
  { minX: -0.75, maxX: 5, minZ: 1.2, maxZ: 2.8 }
]);
const LOUNGE_DECK = { minX: -14.84, maxX: 3.84, minZ: -7.86, maxZ: -4.3, height: 4.45 };
const LOUNGE_STAIRS = { minX: -14.4, maxX: -12.3, minZ: LOUNGE_DECK.maxZ, maxZ: 3.7, height: LOUNGE_DECK.height, steps: 26 };
const LOUNGE_LAYOUT = {
  building: LOUNGE_BUILDING,
  walls: LOUNGE_WALLS,
  displayName: "기본 아지트",
  upperName: "2층 라운지",
  mezzanine: LOUNGE_DECK,
  stairs: LOUNGE_STAIRS,
  pillars: [],
  railings: [
    { x: (LOUNGE_DECK.minX + LOUNGE_STAIRS.minX) / 2, z: LOUNGE_DECK.maxZ, width: LOUNGE_STAIRS.minX - LOUNGE_DECK.minX, depth: 0.08 },
    { x: (LOUNGE_STAIRS.maxX + LOUNGE_DECK.maxX) / 2, z: LOUNGE_DECK.maxZ, width: LOUNGE_DECK.maxX - LOUNGE_STAIRS.maxX, depth: 0.08 },
    { x: LOUNGE_DECK.maxX, z: (LOUNGE_DECK.minZ + LOUNGE_DECK.maxZ) / 2, width: 0.08, depth: LOUNGE_DECK.maxZ - LOUNGE_DECK.minZ }
  ],
  stairRails: [LOUNGE_STAIRS.minX, LOUNGE_STAIRS.maxX].map((x) => ({
    x, z: (LOUNGE_STAIRS.minZ + LOUNGE_STAIRS.maxZ) / 2, width: 0.12, depth: LOUNGE_STAIRS.maxZ - LOUNGE_STAIRS.minZ
  })),
  clearPaths: [...CLEAR_PATHS, {
    minX: LOUNGE_STAIRS.minX, maxX: CLEAR_PATHS[0].maxX, minZ: LOUNGE_STAIRS.maxZ, maxZ: LOUNGE_BUILDING.maxZ
  }],
  mezzaninePaths: [
    { minX: LOUNGE_DECK.minX, maxX: LOUNGE_STAIRS.maxX + 0.4, minZ: -6.3, maxZ: LOUNGE_DECK.maxZ },
    { minX: LOUNGE_STAIRS.maxX, maxX: LOUNGE_DECK.maxX, minZ: -5.55, maxZ: LOUNGE_DECK.maxZ }
  ]
};
export const CLIMBING_V5 = Object.freeze({
  building: { minX: -10, maxX: 10, minZ: -9, maxZ: 5, height: 12 },
  mezzanine: { minX: 1.5, maxX: 10, minZ: -9, maxZ: -2.7, height: 4.2 },
  stairs: { minX: 7.5, maxX: 9.7, minZ: -2.7, maxZ: 3.8, height: 4.2, steps: 26 },
  walls: [
    { x: 0, z: -9, width: 20.2, depth: 0.24, height: 12 },
    { x: -10, z: -2, width: 0.24, depth: 14, height: 12 },
    { x: 10, z: -2, width: 0.24, depth: 14, height: 12, cutaway: true },
    { x: -6.75, z: 5, width: 6.5, depth: 0.24, height: 12, cutaway: true },
    { x: 4.75, z: 5, width: 10.5, depth: 0.24, height: 12, cutaway: true }
  ],
  pillars: [
    { x: 1.65, z: -8.75, width: 0.3, depth: 0.3 },
    { x: 1.65, z: -5, width: 0.3, depth: 0.3 },
    { x: 1.65, z: -2.85, width: 0.3, depth: 0.3 }
  ],
  railings: [
    { x: 1.5, z: -5.85, width: 0.12, depth: 6.3 },
    { x: 4.5, z: -2.7, width: 6, depth: 0.12 },
    { x: 9.85, z: -2.7, width: 0.3, depth: 0.12 }
  ],
  stairRails: [
    { x: 7.5, z: 0.55, width: 0.12, depth: 6.5 },
    { x: 9.7, z: 0.55, width: 0.12, depth: 6.5 }
  ],
  clearPaths: [
    { minX: -3.25, maxX: -0.75, minZ: -4.5, maxZ: 12.5 },
    { minX: -0.75, maxX: 9.7, minZ: 3.45, maxZ: 5 },
    { minX: 7.1, maxX: 10, minZ: -2.7, maxZ: 5 }
  ],
  mezzaninePaths: [
    { minX: 7.1, maxX: 10, minZ: -4.3, maxZ: -2.7 },
    { minX: 1.5, maxX: 10, minZ: -4.3, maxZ: -2.7 }
  ],
  facilityWalk: [
    { minX: -10, maxX: -8.4, minZ: -9, maxZ: 2.4 },
    { minX: -8.4, maxX: 1.3, minZ: -9, maxZ: -7.4 },
    { minX: 2, maxX: 7.1, minZ: -9, maxZ: -8.1 }
  ],
  facilityPlacement: [
    { minX: -10, maxX: -5.4, minZ: -9, maxZ: 2.8 },
    { minX: -5.4, maxX: 1.3, minZ: -9, maxZ: -5.4 },
    { minX: 2, maxX: 7.1, minZ: -9, maxZ: -8.1 }
  ]
});
export const CLIMBING_V6 = Object.freeze({
  displayName: "클라이밍 전용 암장", groundName: "1층 클라이밍 홀",
  building: { minX: -8, maxX: 8, minZ: -9, maxZ: 5, height: 10.5 },
  mezzanine: { minX: 0, maxX: 8, minZ: -9, maxZ: -3, height: 4.2 },
  stairs: { minX: 5.6, maxX: 7.7, minZ: -3, maxZ: 3.8, height: 4.2, steps: 26 },
  walls: [
    { x: 0, z: -9, width: 16.2, depth: 0.24, height: 10.5 },
    { x: -8, z: -2, width: 0.24, depth: 14, height: 10.5 },
    { x: 8, z: -2, width: 0.24, depth: 14, height: 10.5, cutaway: true },
    { x: -5.75, z: 5, width: 4.5, depth: 0.24, height: 10.5, cutaway: true },
    { x: 3.75, z: 5, width: 8.5, depth: 0.24, height: 10.5, cutaway: true }
  ],
  pillars: [
    { x: 0.15, z: -8.75, width: 0.3, depth: 0.3 },
    { x: 0.15, z: -6, width: 0.3, depth: 0.3 },
    { x: 0.15, z: -3.15, width: 0.3, depth: 0.3 }
  ],
  railings: [
    { x: 0, z: -6, width: 0.12, depth: 6 },
    { x: 2.8, z: -3, width: 5.6, depth: 0.12 },
    { x: 7.85, z: -3, width: 0.3, depth: 0.12 }
  ],
  stairRails: [
    { x: 5.6, z: 0.4, width: 0.12, depth: 6.8 },
    { x: 7.7, z: 0.4, width: 0.12, depth: 6.8 }
  ],
  clearPaths: [
    { minX: -3.25, maxX: -0.75, minZ: -4.5, maxZ: 12.5 },
    { minX: -0.75, maxX: 7.7, minZ: 3.45, maxZ: 5 },
    { minX: 5.2, maxX: 8, minZ: -3, maxZ: 5 }
  ],
  mezzaninePaths: [{ minX: 0, maxX: 8, minZ: -4.5, maxZ: -3 }],
  mats: [
    { bounds: { minX: -8, maxX: -3.8, minZ: -9, maxZ: 2.8 }, height: 0.35 },
    { bounds: { minX: -3.8, maxX: 0, minZ: -9, maxZ: -5.4 }, height: 0.35 }
  ],
  facilityWalk: [
    { minX: -8, maxX: -6.4, minZ: -9, maxZ: 2.4 },
    { minX: -6.4, maxX: 0, minZ: -9, maxZ: -7.4 },
    { minX: 0.4, maxX: 5.4, minZ: -9, maxZ: -8.1 }
  ],
  facilityPlacement: [
    { minX: -8, maxX: -3.8, minZ: -9, maxZ: 2.8 },
    { minX: -3.8, maxX: 0, minZ: -9, maxZ: -5.4 },
    { minX: 0.4, maxX: 5.4, minZ: -9, maxZ: -8.1 }
  ]
});
export const BOARDGAME_V6 = Object.freeze({
  displayName: "보드게임 라이브러리", groundName: "1층 게임 라운지",
  building: { minX: -7, maxX: 7, minZ: -8, maxZ: 5, height: 7.4 },
  mezzanine: { minX: -7, maxX: 7, minZ: -8, maxZ: -3.5, height: 3.4 },
  stairs: { minX: -6.7, maxX: -4.7, minZ: -3.5, maxZ: 2.3, height: 3.4, steps: 22 },
  walls: [
    { x: 0, z: -8, width: 14.2, depth: 0.24, height: 7.4 },
    { x: -7, z: -1.5, width: 0.24, depth: 13, height: 7.4, cutaway: true },
    { x: 7, z: -1.5, width: 0.24, depth: 13, height: 7.4 },
    { x: -5.25, z: 5, width: 3.5, depth: 0.24, height: 7.4, cutaway: true },
    { x: 3.25, z: 5, width: 7.5, depth: 0.24, height: 7.4, cutaway: true }
  ],
  pillars: [
    { x: -4.35, z: -3.7, width: 0.24, depth: 0.24 },
    { x: 1.7, z: -3.7, width: 0.24, depth: 0.24 },
    { x: 6.8, z: -3.7, width: 0.24, depth: 0.24 }
  ],
  railings: [
    { x: -6.85, z: -3.5, width: 0.3, depth: 0.12 },
    { x: 1.15, z: -3.5, width: 11.7, depth: 0.12 }
  ],
  stairRails: [
    { x: -6.7, z: -0.6, width: 0.12, depth: 5.8 },
    { x: -4.7, z: -0.6, width: 0.12, depth: 5.8 }
  ],
  clearPaths: [
    { minX: -3, maxX: -1, minZ: 3, maxZ: 12.5 },
    { minX: -6.7, maxX: 6.5, minZ: 3, maxZ: 4.4 },
    { minX: -6.95, maxX: -4.4, minZ: -3.5, maxZ: 3.4 },
    { minX: 1.9, maxX: 3, minZ: -6.8, maxZ: 3.3 }
  ],
  mezzaninePaths: [{ minX: -7, maxX: 7, minZ: -4.8, maxZ: -3.5 }],
  facilityWalk: [
    { minX: -4.4, maxX: 1.7, minZ: -4.45, maxZ: -3.65 },
    { minX: 1.7, maxX: 7, minZ: -8, maxZ: -7.2 }
  ],
  facilityPlacement: [
    { minX: -4.4, maxX: 1.7, minZ: -4.45, maxZ: -3.65 },
    { minX: 1.7, maxX: 7, minZ: -8, maxZ: -7.2 }
  ]
});
export const CLIMBING = Object.freeze({
  displayName: "클라이밍 전용 암장",
  groundName: "1층 클라이밍 홀",
  building: { minX: -9, maxX: 9, minZ: -11, maxZ: 5, height: 12 },
  mezzanine: { minX: 0, maxX: 9, minZ: -11, maxZ: -4, height: 5.0 },
  stairs: { minX: 6.6, maxX: 8.7, minZ: -4, maxZ: 3.8, height: 5.0, steps: 30 },
  walls: [
    { x: 0, z: -11, width: 18.2, depth: 0.24, height: 12 },
    { x: -9, z: -3, width: 0.24, depth: 16, height: 12 },
    { x: 9, z: -3, width: 0.24, depth: 16, height: 12, cutaway: true },
    { x: -6.25, z: 5, width: 5.5, depth: 0.24, height: 12, cutaway: true },
    { x: 4.25, z: 5, width: 9.5, depth: 0.24, height: 12, cutaway: true }
  ],
  pillars: [
    { x: 0.15, z: -10.75, width: 0.3, depth: 0.3, height: 5.0 },
    { x: 0.15, z: -7.5, width: 0.3, depth: 0.3, height: 5.0 },
    { x: 0.15, z: -4.15, width: 0.3, depth: 0.3, height: 5.0 }
  ],
  railings: [
    { x: 0, z: -7.5, width: 0.12, depth: 7, height: 1 },
    { x: 3.3, z: -4, width: 6.6, depth: 0.12, height: 1 },
    { x: 8.85, z: -4, width: 0.3, depth: 0.12, height: 1 }
  ],
  stairRails: [
    { x: 6.6, z: -0.1, width: 0.12, depth: 7.8, height: 1 },
    { x: 8.7, z: -0.1, width: 0.12, depth: 7.8, height: 1 }
  ],
  clearPaths: [
    { minX: -3.25, maxX: -0.75, minZ: -4.5, maxZ: 12.5 },
    { minX: -0.75, maxX: 8.7, minZ: 3.45, maxZ: 5 },
    { minX: 6.2, maxX: 9, minZ: -4, maxZ: 5 }
  ],
  mezzaninePaths: [
    { minX: 0, maxX: 9, minZ: -5.3, maxZ: -4 }
  ],
  mats: [
    { bounds: { minX: -9, maxX: -4.8, minZ: -11, maxZ: 2.8 }, height: 0.35 },
    { bounds: { minX: -4.8, maxX: 0, minZ: -11, maxZ: -7.4 }, height: 0.35 }
  ],
  facilityWalk: [
    { minX: -9, maxX: -7.4, minZ: -11, maxZ: 2.4 },
    { minX: -7.4, maxX: 0, minZ: -11, maxZ: -9.4 },
    { minX: 0.8, maxX: 5.8, minZ: -5.6, maxZ: -4.6 }
  ],
  facilityPlacement: [
    { minX: -9, maxX: -4.8, minZ: -11, maxZ: 2.8 },
    { minX: -4.8, maxX: 0, minZ: -11, maxZ: -7.4 },
    { minX: 0.8, maxX: 5.8, minZ: -5.6, maxZ: -4.6 }
  ]
});
export const BOARDGAME = Object.freeze({
  displayName: "보드게임 라이브러리",
  groundName: "1층 게임 라운지",
  building: { minX: -10, maxX: 10, minZ: -13, maxZ: 5, height: 9.6 },
  mezzanine: { minX: -10, maxX: 10, minZ: -13, maxZ: -7, height: 4.5 },
  stairs: { minX: -9.7, maxX: -7.7, minZ: -7, maxZ: 0.6, height: 4.5, steps: 28 },
  walls: [
    { x: 0, z: -13, width: 20.2, depth: 0.24, height: 9.6 },
    { x: -10, z: -4, width: 0.24, depth: 18, height: 9.6, cutaway: true },
    { x: 10, z: -4, width: 0.24, depth: 18, height: 9.6 },
    { x: -6.75, z: 5, width: 6.5, depth: 0.24, height: 9.6, cutaway: true },
    { x: 4.75, z: 5, width: 10.5, depth: 0.24, height: 9.6, cutaway: true }
  ],
  pillars: [
    { x: -7.4, z: -7.1, width: 0.24, depth: 0.24, height: 4.5 },
    { x: 0.3, z: -7.1, width: 0.24, depth: 0.24, height: 4.5 },
    { x: 9.8, z: -7.1, width: 0.24, depth: 0.24, height: 4.5 }
  ],
  railings: [
    { x: -9.85, z: -7, width: 0.3, depth: 0.12, height: 1 },
    { x: 1.15, z: -7, width: 17.7, depth: 0.12, height: 1 }
  ],
  stairRails: [
    { x: -9.7, z: -3.2, width: 0.12, depth: 7.6, height: 1 },
    { x: -7.7, z: -3.2, width: 0.12, depth: 7.6, height: 1 }
  ],
  clearPaths: [
    { minX: -3.25, maxX: -0.75, minZ: 3.45, maxZ: 12.5 },
    { minX: -9.7, maxX: 9.7, minZ: 3.45, maxZ: 4.85 },
    { minX: -9.95, maxX: -7.4, minZ: -7, maxZ: 4.85 },
    { minX: -0.9, maxX: 0.2, minZ: -6.8, maxZ: 3.45 }
  ],
  mezzaninePaths: [
    { minX: -10, maxX: 10, minZ: -7.9, maxZ: -7 }
  ],
  facilityWalk: [
    { minX: -7.4, maxX: 9.7, minZ: -7.85, maxZ: -7.15 }
  ],
  facilityPlacement: [
    { minX: -7.4, maxX: 9.7, minZ: -7.85, maxZ: -7.15 }
  ]
});
export function getRoomLayout(template = "lounge", version = 11) {
  if (template && typeof template === "object") {
    version = template.version ?? version;
    template = template.template ?? "lounge";
  }
  const extended = version >= 11 ? CURRENT_LAYOUTS[template] : version >= 10 ? REFERENCE_LAYOUTS[template] : version >= 9 && (DINING_BAND_LAYOUTS[template] || STUDY_PHOTO_LAYOUTS[template]);
  const lounge = template === "lounge" && version === LOUNGE_LOFT_VERSION ? LOUNGE_LAYOUT : null;
  const layout = extended || lounge || (template === "climbing" ? CLIMBING : template === "boardgame" ? BOARDGAME :
    { building: BUILDING, walls: BUILDING_WALLS, clearPaths: CLEAR_PATHS });
  const island = version >= 9 ? getIslandLayout(layout.building) : null;
  return { ...layout,
    ...(version >= 9 ? { facilityWalk: [], facilityPlacement: [], mats: [], island, yard: island.entrance, exterior: island.exterior } : {}),
    entrance: { ...ENTRANCE, minX: layout.building.minX, maxX: layout.building.maxX },
    ...(version >= 11 && CURRENT_LAYOUTS[template] ? { terrace: {
      minX: layout.building.minX, maxX: layout.building.maxX,
      minZ: layout.building.maxZ, maxZ: layout.building.maxZ + 5.6,
      fixtures: [layout.building.minX + 2.1, layout.building.maxX - 2.1].map(x => ({
        x, z: layout.building.maxZ + 4.65, width: 3.2, depth: 1.2
      }))
    } } : {}),
    clearPaths: layout.clearPaths.map((path) => ({ ...path, maxZ: Math.min(path.maxZ, island?.entrance.maxZ || ENTRANCE.maxZ) }))
  };
}
export function itemElevation(item, template) {
  return item.level === 1 ? getRoomLayout(template).mezzanine?.height || 0 : 0;
}
export function boundsForBox({ x, z, width, depth }) {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}
export function overlaps(a, b, padding = 0) {
  return a.minX < b.maxX + padding && a.maxX > b.minX - padding && a.minZ < b.maxZ + padding && a.maxZ > b.minZ - padding;
}
export function contains(area, bounds) {
  return bounds.minX >= area.minX && bounds.maxX <= area.maxX && bounds.minZ >= area.minZ && bounds.maxZ <= area.maxZ;
}
export function facilityBounds(template, placement = false, version = 9) {
  if (template && typeof template === "object") { version = template.version ?? version; template = template.template; }
  if (version >= 9) return [];
  if (["climbing", "boardgame"].includes(template)) {
    const layout = getRoomLayout(template, version);
    return placement ? layout.facilityPlacement : layout.facilityWalk;
  }
  if (template === "band") return [{ minX: -9.3, maxX: 2.8, minZ: -7.8, maxZ: -4.6 }];
  return [{ minX: -9.4, maxX: -4.2, minZ: -7.8, maxZ: -6.5 }];
}
export function roomZoneAt(x, z, template, y = 0) {
  const layout = getRoomLayout(template);
  const point = { minX: x, maxX: x, minZ: z, maxZ: z };
  if (contains(layout.entrance, point)) return "현관 앞 마당";
  if (layout.terrace && y === 0 && contains(layout.terrace, point)) return "야외 테라스";
  if (layout.exterior?.some((area) => contains(area, point))) {
    if (z > layout.building.maxZ) return "앞마당 정원";
    if (z < layout.building.minZ) return "뒷마당";
    return "옆마당 산책길";
  }
  if (layout.mezzanine) {
    if (contains(layout.stairs, point)) return layout.upperName ? `${layout.upperName}로 가는 계단` : "중층으로 가는 계단";
    if (y >= layout.mezzanine.height - 0.2) return layout.upperName || "중층 라운지";
    if (layout.groundName && contains(layout.building, point)) return layout.groundName;
    if (layout.upperName && x < BUILDING.minX && contains(layout.building, point)) return "메인홀";
  }
  return ROOM_ZONES.find((area) => area.id !== "entrance" && contains(area, point))?.name || "아지트";
}
