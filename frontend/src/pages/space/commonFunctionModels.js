import * as THREE from "three";
import { commonFunctionForItem } from "./commonFunctionAssets";

const WOOD = "#b58358";
const CREAM = "#fff1d9";
const BRASS = "#bb965e";
const INK = "#5d5661";

function boardFace(kit, width, top, side, color, activity) {
  const face = new THREE.Group();
  face.name = side > 0 ? "common-board-front" : "common-board-back";
  face.rotation.y = side > 0 ? 0 : Math.PI;
  kit.group.add(face);
  const box = (w, h, d, tone, x, y, z, radius = 0.02) => kit.box(w, h, d, tone, x, y, z, radius, face);
  const cylinder = (radius, depth, tone, x, y, z) => {
    const disc = kit.cylinder(radius, radius, depth, tone, x, y, z, face);
    disc.rotation.x = Math.PI / 2;
    return disc;
  };
  box(width - 0.18, top - 0.86, 0.035, "#e7d4b1", 0, (top + 0.78) / 2, 0.105);
  box(width - 0.27, 0.3, 0.04, color, 0, top - 0.23, 0.135);
  if (activity) {
    const camera = box(0.3, 0.19, 0.03, CREAM, 0, top - 0.23, 0.175, 0.025);
    camera.name = "activity-camera-emblem";
    box(0.12, 0.045, 0.025, CREAM, -0.04, top - 0.12, 0.175, 0.009);
    cylinder(0.064, 0.02, INK, 0.025, top - 0.23, 0.198);
    cylinder(0.038, 0.025, "#d7c4a5", 0.025, top - 0.23, 0.21);
    for (const x of [-0.52, 0.52]) for (const y of [1.2, 1.78]) {
      const slot = box(0.83, 0.5, 0.035, CREAM, x, y, 0.145, 0.018);
      slot.name = "empty-photo-slot";
      box(0.71, 0.35, 0.013, "#ddd1b9", x, y + 0.025, 0.171, 0.01);
      box(0.13, 0.02, 0.015, "#998d7b", x, y + 0.025, 0.185, 0.005);
      box(0.02, 0.13, 0.015, "#998d7b", x, y + 0.025, 0.185, 0.005);
      cylinder(0.027, 0.026, BRASS, x, y + 0.24, 0.19);
    }
  } else {
    const emblem = cylinder(0.1, 0.03, CREAM, 0, top - 0.23, 0.175);
    emblem.name = "dashboard-information-emblem";
    box(0.027, 0.085, 0.025, color, 0, top - 0.25, 0.205, 0.008);
    cylinder(0.018, 0.027, color, 0, top - 0.17, 0.205);
    const notice = box(1.21, 0.62, 0.025, CREAM, 0, 1.52, 0.145, 0.012);
    notice.name = "empty-notice-sheet";
    box(0.19, 0.065, 0.033, BRASS, 0, 1.83, 0.175, 0.01);
    for (const x of [-0.39, 0.39]) {
      const card = box(0.56, 0.27, 0.025, "#f1e4cb", x, 1.02, 0.145, 0.012);
      card.name = "empty-dashboard-card";
      cylinder(0.023, 0.026, BRASS, x, 1.14, 0.18);
    }
  }
}

export function createCommonFunctionAsset(kind, { color } = {}, createKit) {
  if (!["activityBoard", "clubDashboard"].includes(kind)) return null;
  const activity = kind === "activityBoard";
  const width = activity ? 2.4 : 1.8;
  const top = activity ? 2.5 : 2.3;
  const accent = color || commonFunctionForItem({ kind }).color;
  const kit = createKit(kind);
  kit.group.userData.assetKind = kind;
  for (const x of [-width * 0.34, width * 0.34]) {
    kit.box(0.11, 1, 0.12, WOOD, x, 0.56, 0, 0.025);
    const foot = kit.box(0.26, 0.1, 0.68, WOOD, x, 0.05, 0, 0.035);
    foot.name = "common-board-foot";
    for (const z of [-0.25, 0.25]) kit.box(0.2, 0.012, 0.1, "#66594b", x, 0.007, z, 0.005);
    kit.box(0.14, 0.075, 0.14, BRASS, x, 0.25, 0, 0.015);
  }
  kit.box(width - 0.08, top - 0.8, 0.2, WOOD, 0, (top + 0.72) / 2, 0, 0.045);
  for (const x of [-width / 2 + 0.055, width / 2 - 0.055]) {
    kit.box(0.11, top - 0.76, 0.24, WOOD, x, (top + 0.76) / 2, 0, 0.035);
  }
  kit.box(width, 0.11, 0.27, WOOD, 0, top - 0.055, 0, 0.035);
  kit.box(width, 0.13, 0.32, WOOD, 0, 0.79, 0, 0.025);
  for (const side of [-1, 1]) boardFace(kit, width, top, side, accent, activity);
  return kit.group;
}
