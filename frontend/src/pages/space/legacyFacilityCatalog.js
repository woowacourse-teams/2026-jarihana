// Preset facilities use the same editable item contract as ordinary furnishings.
// Wall and ceiling fixtures retain floor-relative heights when moved to another map.
export const LEGACY_FACILITY_ASSETS = Object.freeze([
  { kind: "libraryShelfWood", name: "원목 게임 라이브러리", width: 2.4, depth: 0.7, height: 3.34, collection: "boardgame" },
  { kind: "libraryShelfDisplay", name: "게임 전시 라이브러리", width: 2.4, depth: 0.7, height: 3.34, collection: "boardgame" },
  { kind: "libraryShelfDark", name: "다크 게임 라이브러리", width: 2.4, depth: 0.7, height: 3.34, collection: "boardgame" },
  { kind: "gameWallBoard", name: "게임방 추억 게시판", width: 4.8, depth: 0.18, height: 3.45, mount: "wall", collection: "boardgame" },
  { kind: "gameWallArt", name: "게임 아트와 벽 조명", width: 2.7, depth: 0.5, height: 3.4, mount: "wall", collection: "boardgame" },
  { kind: "gameNeon", name: "Good Game 네온", width: 3.1, depth: 0.7, height: 7.8, mount: "wall", collection: "boardgame" },
  { kind: "pendantLight", name: "높은 홀 펜던트", width: 0.8, depth: 0.8, height: 7.8, mount: "ceiling", collection: "common" },
  { kind: "pendantBulb", name: "높은 홀 전구", width: 0.3, depth: 0.3, height: 7.8, mount: "ceiling", collection: "common" },
  { kind: "loftPendant", name: "다락 펜던트", width: 0.8, depth: 0.8, height: 4.2, mount: "ceiling", collection: "common" },
  { kind: "shelfPendant", name: "서가 펜던트", width: 0.3, depth: 0.3, height: 3.34, mount: "ceiling", collection: "common" },
  { kind: "climbingWallWide", name: "높은 클라이밍 월", width: 3.34, depth: 2.06, height: 11.31, connectedSurface: true, collection: "climbing" },
  { kind: "climbingWallOverhang", name: "오버행 클라이밍 월", width: 3.34, depth: 2.5, height: 11.31, connectedSurface: true, collection: "climbing" },
  { kind: "climbingWallNarrow", name: "코너 클라이밍 월", width: 3, depth: 2.08, height: 11.31, connectedSurface: true, collection: "climbing" },
  { kind: "crashMat", name: "35cm 클라이밍 매트", width: 4.15, depth: 2.3, height: 0.35, walkableHeight: 0.35, collection: "climbing" },
  { kind: "crashMatWide", name: "35cm 와이드 매트", width: 4.75, depth: 1.8, height: 0.35, walkableHeight: 0.35, collection: "climbing" },
  { kind: "climbingShoeShelf", name: "암벽화 보관장", width: 1.66, depth: 0.95, height: 3.53, collection: "climbing" },
  { kind: "climbingHelmetShelf", name: "헬멧 보관장", width: 1.66, depth: 0.95, height: 2.5, collection: "climbing" },
  { kind: "climbingGearShelf", name: "초크백과 장비 보관장", width: 1.66, depth: 0.95, height: 3.53, collection: "climbing" },
  { kind: "ropeRack", name: "클라이밍 로프 걸이", width: 1.65, depth: 0.35, height: 3.5, mount: "wall", collection: "climbing" },
  { kind: "climbingPlant", name: "암장의 잎사귀 화분", width: 0.7, depth: 0.7, height: 1.1, collection: "common" },
  { kind: "climbingSign", name: "Higher Together 사인", width: 2.65, depth: 0.22, height: 3.88, mount: "wall", collection: "climbing" },
  { kind: "climbingBoard", name: "클라이밍 기록 보드", width: 4.8, depth: 0.18, height: 3.58, mount: "wall", collection: "climbing" },
  { kind: "clubPinboard", name: "덩굴 추억 게시판", width: 5.6, depth: 0.8, height: 3.8, mount: "wall", collection: "common" },
  { kind: "cafeCounter", name: "아지트 카페 카운터", width: 3.8, depth: 1.2, height: 3.1, collection: "common" },
  { kind: "cafeFridge", name: "아지트 냉장고", width: 0.92, depth: 1, height: 1.95, collection: "common" }
].map((asset) => Object.freeze({ category: "furniture", ...asset })));

export function createLegacyFacilityItems(template) {
  const item = (id, kind, x, z, rotation = 0, level = 0) => ({ id: `facility-${id}`, kind, x, z, rotation, ...(level ? { level } : {}) });
  if (template === "boardgame") return [
    ...[-6.18, -3.75, -1.32, 1.11, 3.54, 5.97, 8.4].map((x, index) =>
      item(`library-${index}`, index < 2 ? "libraryShelfWood" : index < 4 ? "libraryShelfDisplay" : "libraryShelfDark", x, -7.7)),
    item("game-board", "gameWallBoard", 9.8, -2, 3),
    item("game-neon", "gameNeon", 9.65, -1, 3),
    ...[-6.5, -3.3, 0, 3.3, 6.6].map((x, index) => item(`upper-art-${index}`, "gameWallArt", x, -12.7, 0, 1)),
    ...[-1.5, -0.2, 1.1].map((z, index) => item(`bulb-${index}`, "pendantBulb", -4.3, z)),
    ...[3.8, 5.8].map((x, index) => item(`pendant-${index}`, "pendantLight", x, -2.2)),
    ...[[-5.5, -10.35], [0, -11.3], [6.2, -10.4]].map(([x, z], index) => item(`loft-light-${index}`, "loftPendant", x, z, 0, 1)),
    ...[-6.18, -1.32, 3.54, 8.4].map((x, index) => item(`shelf-light-${index}`, "shelfPendant", x, -7.06))
  ];
  if (template === "climbing") return [
    ...Array.from({ length: 4 }, (_, index) => item(`wall-left-${index}`, index === 1 ? "climbingWallOverhang" : "climbingWallWide", index === 1 ? -7.55 : -7.73, 2.6 - 3.3375 * (index + 0.5), 1)),
    ...Array.from({ length: 3 }, (_, index) => item(`wall-back-${index}`, "climbingWallNarrow", -8.69 + 2.85 * (index + 0.5) - (index === 2 ? 0.05 : 0), -9.74)),
    ...Array.from({ length: 6 }, (_, index) => item(`mat-left-${index}`, "crashMat", -6.9, -11 + 2.3 * (index + 0.5))),
    ...Array.from({ length: 2 }, (_, index) => item(`mat-back-${index}`, "crashMatWide", -2.4, -11 + 1.8 * (index + 0.5))),
    item("shoe-shelf", "climbingShoeShelf", 1.65, -5.1),
    item("helmet-shelf", "climbingHelmetShelf", 3.3, -5.1),
    item("gear-shelf", "climbingGearShelf", 4.95, -5.1),
    item("ropes", "ropeRack", 3.27, -4.86),
    item("climbing-board", "climbingBoard", 3, -10.8),
    item("climbing-sign", "climbingSign", 7.45, -10.74, 0, 1)
  ];
  if (template === "lounge") return [
    item("cafe-counter", "cafeCounter", -6.15, -7.15),
    item("cafe-fridge", "cafeFridge", -8.65, -7.15),
    item("club-board", "clubPinboard", 7, -7.7)
  ];
  return [];
}
