import * as THREE from "three";
import { createClubhouseArchitecture } from "./clubhouseArchitecture";
import { getRoomLayout, PLAYER } from "./roomLayout";
import { disposeObject } from "./roomModels";

function matching(group, name) {
  const result = [];
  group.traverse((object) => { if (object.name === name) result.push(object); });
  return result;
}

test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s architectural floors and stairs match the navigable layout", (template) => {
  const layout = getRoomLayout(template);
  const root = createClubhouseArchitecture(layout, { template, floorColor: "#b18d6e", wallColor: "#d7c7b4" });
  try {
    root.updateMatrixWorld(true);
    const ground = new THREE.Box3().setFromObject(root.children.find((object) => object.name === "floor-slab"));
    expect(ground.min.x).toBeCloseTo(layout.building.minX);
    expect(ground.max.x).toBeCloseTo(layout.building.maxX);
    expect(ground.min.z).toBeCloseTo(layout.building.minZ);
    expect(ground.max.z).toBeCloseTo(layout.building.maxZ);
    expect(ground.max.y).toBeCloseTo(0);
    const loft = root.getObjectByName("clubhouse-mezzanine");
    expect(loft.userData.mezzanine).toBe(true);
    const deck = new THREE.Box3().setFromObject(loft.children.find((object) => object.name === "floor-slab"));
    expect(deck.min.x).toBeCloseTo(layout.mezzanine.minX);
    expect(deck.max.x).toBeCloseTo(layout.mezzanine.maxX);
    expect(deck.min.z).toBeCloseTo(layout.mezzanine.minZ);
    expect(deck.max.z).toBeCloseTo(layout.mezzanine.maxZ);
    expect(deck.max.y).toBeCloseTo(layout.mezzanine.height);
    const treads = matching(root, "stair-tread");
    expect(treads).toHaveLength(layout.stairs.steps);
    treads.forEach((tread, index) => {
      const bounds = new THREE.Box3().setFromObject(tread);
      expect(bounds.min.x).toBeCloseTo(layout.stairs.minX);
      expect(bounds.max.x).toBeCloseTo(layout.stairs.maxX);
      expect(bounds.max.y).toBeCloseTo((index + 1) / layout.stairs.steps * layout.stairs.height);
    });
    const entrance = new THREE.Raycaster(new THREE.Vector3(-2, PLAYER.eyeHeight, 6.8), new THREE.Vector3(0, 0, -1), 0, 3);
    expect(entrance.intersectObject(root, true)).toHaveLength(0);
  } finally { disposeObject(root); }
});

test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s retains full-height boundaries and marks roof/front walls for walking views", (template) => {
  const layout = getRoomLayout(template);
  const root = createClubhouseArchitecture(layout, { template, floorColor: "#b18d6e", wallColor: "#d7c7b4" });
  try {
    const roof = root.getObjectByName("interior-ceiling");
    expect(roof.userData.walkthroughOnly).toBe(true);
    const ceiling = new THREE.Box3().setFromObject(root.getObjectByName("ceiling"));
    expect(ceiling.min.y).toBeCloseTo(layout.building.height);
    expect(ceiling.max.x - ceiling.min.x).toBeCloseTo(layout.building.maxX - layout.building.minX);
    const roofDeck = new THREE.Box3().setFromObject(root.getObjectByName("roof-deck"));
    expect(roofDeck.min.y - ceiling.min.y).toBeGreaterThan(0.03);
    expect(roofDeck.max.y).toBeCloseTo(layout.building.height + 0.24);
    const walls = matching(root, "clubhouse-wall");
    expect(walls).toHaveLength(layout.walls.length);
    expect(walls.filter((wall) => wall.userData.walkthroughOnly)).toHaveLength(layout.walls.filter((wall) => wall.cutaway).length);
    expect(walls.every((wall) => wall.userData.buildingWall)).toBe(true);
    expect(matching(root, "window-mullion").length).toBeGreaterThan(4);
    const lamps = [];
    root.traverse((object) => {
      let context = object.parent;
      while(context && context.name !== "building-context") context = context.parent;
      if (object.isPointLight && object.userData.roomLamp && !context) lamps.push(object);
    });
    // Preset lighting is movable room data, never baked into the building.
    expect(lamps).toHaveLength(0);
    expect(root.getObjectByName("trackLight")).toBeUndefined();
  } finally { disposeObject(root); }
});
