export const FLOOR_MATERIALS = Object.freeze([
  { id: "auto", name: "테마 기본 바닥" }, { id: "oak", name: "밝은 오크 마루" },
  { id: "walnut", name: "월넛 마루" }, { id: "herringbone", name: "헤링본 마루" },
  { id: "concrete", name: "노출 콘크리트" }, { id: "stone", name: "석재 타일" },
  { id: "terrazzo", name: "테라조" }, { id: "checker", name: "체커 타일" }
]);
export const WALL_MATERIALS = Object.freeze([
  { id: "auto", name: "테마 기본 벽" }, { id: "plaster", name: "미장 벽" },
  { id: "limewash", name: "라임워시" }, { id: "brick", name: "노출 벽돌" },
  { id: "wallpaper", name: "직조 벽지" }, { id: "woodpanel", name: "세로 원목 패널" },
  { id: "acoustic", name: "패브릭 흡음벽" }
]);
export const TEMPLATE_SURFACES = Object.freeze({
  lounge: { floor: "oak", wall: "wallpaper" },
  climbing: { floor: "stone", wall: "plaster" },
  boardgame: { floor: "walnut", wall: "limewash" },
  dining: { floor: "oak", wall: "plaster" },
  band: { floor: "walnut", wall: "acoustic" },
  study: { floor: "stone", wall: "wallpaper" },
  photo: { floor: "oak", wall: "limewash" }
});
export function resolveSurface(template, surface, selected = "auto") {
  return selected === "auto" ? (TEMPLATE_SURFACES[template] || TEMPLATE_SURFACES.lounge)[surface] : selected;
}

// Estimated physical dimensions from the reference images, in metres.
// Explicit material choices use their own profile rather than the preset profile.
export const FLOOR_PROFILES = Object.freeze({
  climbing: { tileSize: 1.2 },
  study: { tileSize: 0.9 },
  dining: { plankWidth: 0.32, plankLength: 3.2, direction: 0, seed: 11 },
  boardgame: { plankWidth: 0.26, plankLength: 2.5, direction: 1, seed: 23 },
  band: { plankWidth: 0.18, plankLength: 2.2, direction: 0, seed: 37 },
  photo: { plankWidth: 0.28, plankLength: 2.8, direction: 1, seed: 41 }
});
export function resolveFloorProfile(template, selected = "auto") {
  return selected === "auto" ? FLOOR_PROFILES[template] || {} : {};
}
