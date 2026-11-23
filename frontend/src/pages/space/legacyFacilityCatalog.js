// Preset facilities use the same editable item contract as ordinary furnishings.
// Wall and ceiling fixtures retain floor-relative heights when moved to another map.
export const LEGACY_FACILITY_KINDS = Object.freeze([
  "libraryShelfWood", "libraryShelfDisplay", "libraryShelfDark", "gameWallBoard", "gameWallArt", "gameNeon",
  "pendantLight", "pendantBulb", "loftPendant", "shelfPendant", "climbingWallWide", "climbingWallOverhang",
  "climbingWallNarrow", "crashMat", "crashMatWide", "climbingShoeShelf", "climbingHelmetShelf", "climbingGearShelf",
  "ropeRack", "climbingPlant", "climbingSign", "climbingBoard", "clubPinboard", "cafeCounter",
  "cafeFridge"
]);

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
