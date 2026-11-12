import * as THREE from "three";
import { climbingPanelBacking, createFurniture, createRoomShell, disposeObject } from "./roomModels";
import { boundsForBox, contains, getRoomLayout } from "./roomLayout";
import { CATALOG, ROOM_TEMPLATES, canPlace, createInitialRoom, footprint, validateRoom, placedItemElevation } from "./roomState";

test("band ceiling absorbers use their own editable model and survive a room round trip", () => {
  const room = createInitialRoom("band");
  const cloud = room.items.find(item => item.kind === "acousticCloud");
  const catalog = CATALOG.find(item => item.kind === cloud.kind);
  const model = createFurniture(cloud.kind, { color: cloud.color });
  try {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    expect(catalog.mount).toBe("ceiling");
    expect(size.toArray()).toEqual([catalog.width, catalog.height, catalog.depth].map(value => expect.closeTo(value)));
    expect(model.children.filter(child => child.name === "ceiling-fabric-absorber")).toHaveLength(4);
    const edited = { ...cloud, scaleX: 0.9, color: "#665e78" };
    const items = room.items.map(item => item.id === edited.id ? edited : item);
    expect(canPlace(edited, items, room)).toBe(true);
    expect(validateRoom(JSON.parse(JSON.stringify({ ...room, items }))).items).toContainEqual(edited);
  } finally { disposeObject(model); }
});

test("the music console fits its placement footprint and every template has an accessible saved console", () => {
  const model = createFurniture("musicConsole");
  const catalog = CATALOG.find((item) => item.kind === "musicConsole");
  try {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThanOrEqual(catalog.width + 0.001);
    expect(size.z).toBeLessThanOrEqual(catalog.depth);
    expect(model.getObjectByName("music-console-vinyl")).toBeDefined();
    for (const { id } of ROOM_TEMPLATES) {
      const room = createInitialRoom(id);
      const consoles = room.items.filter((item) => item.kind === "musicConsole");
      expect(consoles).toHaveLength(1);
      const [console] = consoles;
      expect(contains(getRoomLayout(room).building, boundsForBox({ ...console, ...footprint(console) }))).toBe(true);
      expect({ template: id, valid: canPlace(console, room.items, id) }).toEqual({ template: id, valid: true });
      expect(validateRoom(room).items).toEqual(expect.arrayContaining([console]));
    }
  } finally { disposeObject(model); }
});

test("the taller hall is enclosed above the lower side-room roofs, including above doorways", () => {
  const shell = createRoomShell({ floorColor: "#cda17b", wallColor: "#eee3d3" });
  shell.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const { building } = getRoomLayout("lounge");
  const height = (building.height + building.wingHeight) / 2;
  try {
    for (const z of [-6.75, -4.5, -1.25, 2, 4]) {
      ray.set(new THREE.Vector3(1, height, z), new THREE.Vector3(1, 0, 0));
      ray.far = 5;
      const hit = ray.intersectObject(shell, true)[0];
      expect(hit).toBeDefined();
      expect(hit.point.x).toBeCloseTo(3.9);
    }
  } finally {
    disposeObject(shell);
  }
});

test("the default shell matches the widened walkable gallery and stair plan", () => {
  const { building, mezzanine, stairs } = getRoomLayout("lounge");
  const shell = createRoomShell({ template: "lounge" });
  shell.updateMatrixWorld(true);
  try {
    expect([building.maxX - building.minX, building.maxZ - building.minZ]).toEqual([25, 13]);
    const entry = new THREE.Box3().setFromObject(shell.getObjectByName("entry-deck"));
    expect(entry.min.x).toBeCloseTo(building.minX);
    expect(entry.max.x).toBeCloseTo(building.maxX);
    const deck = new THREE.Box3().setFromObject(shell.getObjectByName("lounge-gallery-deck"));
    expect(deck.min.x).toBeCloseTo(mezzanine.minX);
    expect(deck.max.z).toBeCloseTo(mezzanine.maxZ);
    expect(deck.max.y).toBeCloseTo(mezzanine.height);
    const treads = shell.getObjectByName("lounge-staircase").children.filter((piece) => piece.name === "stair-tread");
    expect(treads).toHaveLength(stairs.steps);
    expect(new THREE.Box3().setFromObject(treads.at(-1)).max.y).toBeCloseTo(mezzanine.height);
  } finally {
    disposeObject(shell);
  }
});

const CLIMBING = getRoomLayout("climbing");
function climbingShell() {
  const shell = createRoomShell({ template: "climbing", floorColor: "#b9b3ac", wallColor: "#e9dfd0", matColor: "#7d8b9d" });
  const room = createInitialRoom("climbing");
  for (const item of room.items) {
    const model = createFurniture(item.kind);
    model.position.set(item.x, placedItemElevation(item, room), item.z);
    model.scale.multiply(new THREE.Vector3(item.scaleX ?? 1, item.scaleY ?? 1, item.scaleZ ?? 1));
    model.userData.itemId = item.id;
    model.rotation.y = item.rotation * Math.PI / 2;
    shell.add(model);
  }
  shell.updateMatrixWorld(true);
  return shell;
}

test("climbing uses a tall open hall with a mezzanine instead of the shared side-room partitions", () => {
  const shell = climbingShell();
  try {
    const roof = shell.getObjectByName("interior-ceiling");
    expect(new THREE.Box3().setFromObject(roof).min.y).toBeCloseTo(CLIMBING.building.height);
    const panels = [];
    shell.traverse((object) => { if (object.name === "climbing-panel") panels.push(object); });
    expect(panels.length).toBeGreaterThan(3);
    expect(panels.every((panel) => {
      const top = new THREE.Box3().setFromObject(panel).max.y;
      return top > CLIMBING.building.height - 1.5 && top < CLIMBING.building.height;
    })).toBe(true);
    const hallRay = new THREE.Raycaster(new THREE.Vector3(2, 1.45, 1.8), new THREE.Vector3(1, 0, 0), 0, 3);
    expect(hallRay.intersectObject(shell, true)).toHaveLength(0);
    expect(shell.getObjectByName("hall-upper-wall")).toBeUndefined();
    expect(shell.getObjectByName("clubhouse-mezzanine").userData.mezzanine).toBe(true);
  } finally { disposeObject(shell); }
});

test("the climbing preset joins the shell behind each panel without shifting its climbing face", () => {
  const room = createInitialRoom("climbing");
  const layout = getRoomLayout(room);
  const shell = createRoomShell({ template: room.template, version: room.version });
  shell.updateMatrixWorld(true);
  try {
    for (const item of room.items.filter((entry) => entry.kind.startsWith("climbingWall"))) {
      const left = item.rotation === 1;
      const wall = shell.getObjectByName(left ? "climbing-left-wall-construction" : "climbing-back-wall-construction");
      const surface = wall.children.find((child) => child.name === (left ? "solid-wall" : "window-pier"));
      const axis = left ? "x" : "z";
      const face = new THREE.Box3().setFromObject(surface).max[axis];
      const depth = climbingPanelBacking(item, room, layout);
      expect(depth).toBeGreaterThan(0);

      const model = createFurniture(item.kind, { panelBacking: depth });
      try {
        model.position.set(item.x, 0, item.z);
        model.rotation.y = item.rotation * Math.PI / 2;
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model.getObjectByName("climbing-wall-backing"));
        expect(bounds.min[axis]).toBeCloseTo(face - 0.01);
        expect(model.getObjectByName("climbing-panel").position.z).toBe(-0.98);
      } finally { disposeObject(model); }

      const moved = left ? { ...item, x: item.x + 1 } : { ...item, z: item.z + 1 };
      expect(climbingPanelBacking(moved, room, layout)).toBe(0);
      expect(climbingPanelBacking({ ...item, rotation: 2 }, room, layout)).toBe(0);
      expect(climbingPanelBacking(item, { ...room, version: 10 }, layout)).toBe(0);
    }
    const rearPanel = room.items.find((item) => item.id === "back-wall-2");
    expect(climbingPanelBacking({ ...rearPanel, x: 6.8 }, room, layout)).toBe(0);
  } finally { disposeObject(shell); }
});

test("the mezzanine and staircase treads use the same height and footprint as walking", () => {
  const shell = climbingShell();
  try {
    const deck = shell.getObjectByName("clubhouse-mezzanine").children.find(object => object.name === "floor-slab");
    const deckBounds = new THREE.Box3().setFromObject(deck);
    expect(deckBounds.max.y).toBeCloseTo(CLIMBING.mezzanine.height);
    expect(deckBounds.min.x).toBeCloseTo(CLIMBING.mezzanine.minX);
    expect(deckBounds.max.z).toBeCloseTo(CLIMBING.mezzanine.maxZ);
    const stairs = shell.getObjectByName("clubhouse-mezzanine");
    const treads = stairs.children.filter((object) => object.name === "stair-tread");
    expect(treads).toHaveLength(CLIMBING.stairs.steps);
    treads.forEach((tread, index) => {
      expect(new THREE.Box3().setFromObject(tread).max.y).toBeCloseTo(CLIMBING.stairs.height * (index + 1) / CLIMBING.stairs.steps);
    });
    expect(Math.max(...treads.map(tread => new THREE.Box3().setFromObject(tread).max.z))).toBeLessThan(CLIMBING.building.maxZ - 0.8);
    const down = new THREE.Raycaster(new THREE.Vector3(5, 7, -7), new THREE.Vector3(0, -1, 0));
    expect(down.intersectObject(deck)[0].point.y).toBeCloseTo(CLIMBING.mezzanine.height);
  } finally { disposeObject(shell); }
});

test("landing mats and thin warm-up mats have the intended heights and the ceiling can be removed for editing", () => {
  const shell = climbingShell();
  try {
    const landingMats = shell.children.filter(object => object.userData.itemId?.startsWith("mat-") && object.getObjectByName("crash-mat"));
    expect(landingMats).toHaveLength(9);
    landingMats.forEach((mat) => {
      const bounds = new THREE.Box3().setFromObject(mat);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeCloseTo(0.385);
    });
    const stretchMat = shell.children.find(object => object.userData.itemId === "warmup-stretch-mat");
    expect(new THREE.Box3().setFromObject(stretchMat).max.y).toBeCloseTo(0.0875);
    expect(shell.getObjectByName("building-entrance").userData.exteriorDetail).toBe(true);
    expect(shell.getObjectByName("interior-ceiling").userData.walkthroughOnly).toBe(true);
    for (const kind of ["trackLight", "ceilingBeam", "hangingLamp"]) {
      const pieces = shell.children.filter(object => object.name === kind);
      expect(pieces.length).toBeGreaterThan(1);
      expect(pieces.every(object => object.userData.itemId)).toBe(true);
    }
  } finally { disposeObject(shell); }
});

test("instanced climbing holds release their instance buffers when a shell is replaced", () => {
  const shell = climbingShell();
  const holds = [];
  shell.traverse((object) => { if (object.isInstancedMesh) holds.push(object); });
  const disposed = jest.fn();
  holds.forEach((hold) => hold.addEventListener("dispose", disposed));
  disposeObject(shell);
  expect(holds.length).toBeGreaterThan(0);
  expect(disposed).toHaveBeenCalledTimes(holds.length);
});

test("editable overhead assets can be removed without losing the structural shell", () => {
  const shell = createRoomShell({template: "climbing"});
  try {
    expect(shell.getObjectByName("interior-ceiling").userData.walkthroughOnly).toBe(true);
    for (const kind of ["ceilingBeam", "trackLight", "hangingLamp"])
      expect(shell.getObjectByName(kind)).toBeUndefined();
    expect(shell.getObjectByName("wall-coping")).toBeDefined();
  } finally { disposeObject(shell); }
});


test("boardgame shell and editable game assets are available through the shared model factories", () => {
  const shell = createRoomShell({ template: "boardgame" });
  const furniture = ["gameTable", "gameShelf", "gameChair", "floorLamp", "roundChair", "clubSofa", "gameCredenza", "loungeRug"].map((kind) => createFurniture(kind));
  try {
    expect(shell.getObjectByName("clubhouse-mezzanine")).toBeDefined();
    expect(shell.getObjectByName("boardgame-boxes")).toBeUndefined();
    expect(shell.getObjectByName("building-entrance")).toBeDefined();
    furniture.forEach((object) => expect(new THREE.Box3().setFromObject(object).isEmpty()).toBe(false));
    expect(furniture[0].getObjectByName("game-die")).toBeUndefined();
    expect(createInitialRoom("boardgame").items.some(item => item.kind === "propGameBoard" && item.parentId)).toBe(true);
  } finally {
    disposeObject(shell);
    furniture.forEach(disposeObject);
  }
});


test("climbing routes, equipment and mezzanine glazing follow the independent preset", () => {
  const shell = climbingShell();
  try {
    const room = createInitialRoom("climbing");
    expect(room.items.filter(item => item.kind.startsWith("climbingWall"))).toHaveLength(8);
    expect(room.items.filter(item => ["crashMat", "crashMatWide"].includes(item.kind))).toHaveLength(11);
    for (const kind of ["climbingShoeShelf", "climbingHelmetShelf", "climbingGearShelf", "ropeRack"])
      expect(shell.children.some(object => object.userData.itemId === room.items.find(item => item.kind === kind).id)).toBe(true);
    const backWall = shell.getObjectByName("climbing-back-wall-construction");
    const mullions = backWall.children.filter(object => object.name === "window-mullion");
    const [opening] = CLIMBING.openings.back;
    expect(mullions).toHaveLength(opening.divisions - 1);
    const bounds = new THREE.Box3().setFromObject(mullions[0]);
    expect(bounds.min.y).toBeCloseTo(opening.sill);
    expect(bounds.max.y).toBeCloseTo(opening.top);
    expect(shell.getObjectByName("higher-together-sign")).toBeDefined();
  } finally { disposeObject(shell); }
});


test("all room templates retain open entrances on a finite grassy floating island", () => {
  for (const template of ["climbing", "boardgame", "lounge", "band", "dining", "study", "photo"]) {
    const shell = createRoomShell({ template });
    shell.updateMatrixWorld(true);
    try {
      expect(shell.getObjectByName("outdoor")).toBeUndefined();
      const context = shell.getObjectByName("building-context");
      const entrance = shell.getObjectByName("building-entrance");
      expect(context.userData.entrance).toBe(true);
      expect(context.userData.outdoor).toBeUndefined();
      expect(entrance).toBeDefined();
      const terrace = shell.getObjectByName("clubhouse-terrace");
      const corridor = terrace || shell.getObjectByName("entrance-path");
      const corridorBounds = new THREE.Box3().setFromObject(corridor);
      expect(corridorBounds.min.z).toBeLessThanOrEqual(5.2);
      expect(corridorBounds.max.z).toBeGreaterThan(8.2);
      if (!terrace) expect(corridorBounds.max.y).toBeLessThanOrEqual(0.03);
      const doors = entrance.children.filter((child) => child.name === "open-glass-entry-door");
      expect(doors).toHaveLength(2);
      doors.forEach((door) => {
        const bounds = new THREE.Box3().setFromObject(door);
        expect(bounds.max.x < -3.5 || bounds.min.x > -0.5).toBe(true);
      });
      for (const x of [-3.45, -2, -0.55]) for (const y of [0.2, 1.45, 2.15]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 8.1), new THREE.Vector3(0, 0, -1), 0, 3.3);
        expect(ray.intersectObject(shell, true)).toHaveLength(0);
      }
      const floorRay = new THREE.Raycaster(new THREE.Vector3(-2, 1.45, 6.8), new THREE.Vector3(0, -1, 0));
      expect(floorRay.intersectObject(corridor, true)[0].point.y).toBeLessThanOrEqual(0.03);
      expect(shell.getObjectByName("rear-neighbor-wall")).toBeUndefined();
      expect(shell.getObjectByName("surrounding-building-floor")).toBeUndefined();
      const surrounding = new THREE.Box3().setFromObject(shell.getObjectByName("island-lawn"));
      expect(surrounding.getSize(new THREE.Vector3()).x).toBeGreaterThanOrEqual(corridorBounds.getSize(new THREE.Vector3()).x + 9.5);
    } finally { disposeObject(shell); }
  }
});

test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s exterior preserves an unobstructed door and a flush terrace", (template) => {
  const shell = createRoomShell({ template });
  const { terrace } = getRoomLayout(template);
  shell.updateMatrixWorld(true);
  try {
    const deck = shell.getObjectByName("clubhouse-terrace");
    expect(shell.getObjectByName("clubhouse-exterior-facade").userData.exteriorDetail).toBe(true);
    expect(shell.getObjectByName("clubhouse-exterior-roof").userData.exteriorOnly).toBe(true);
    expect(shell.getObjectByName("entrance-corridor")).toBeUndefined();
    const fixtures = deck.children.filter((child) => child.name === "terrace-integrated-planter-bench");
    expect(fixtures).toHaveLength(terrace.fixtures.length);
    for (const [index, fixture] of terrace.fixtures.entries()) {
      const bounds = new THREE.Box3().setFromObject(fixtures[index]);
      expect(bounds.min.x).toBeGreaterThanOrEqual(fixture.x - fixture.width / 2 - 0.001);
      expect(bounds.max.x).toBeLessThanOrEqual(fixture.x + fixture.width / 2 + 0.001);
      expect(bounds.min.z).toBeGreaterThanOrEqual(fixture.z - fixture.depth / 2 - 0.001);
      expect(bounds.max.z).toBeLessThanOrEqual(fixture.z + fixture.depth / 2 + 0.001);
    }
    const route = new THREE.Raycaster(new THREE.Vector3(-2, 1.45, terrace.maxZ - 0.4), new THREE.Vector3(0, 0, -1), 0, 5.7);
    expect(route.intersectObject(shell, true)).toHaveLength(0);
    const paving = deck.children.find((child) => child.name === "terrace-stone-paver");
    expect(new THREE.Box3().setFromObject(paving).max.y).toBeCloseTo(0);
  } finally { disposeObject(shell); }
});

test("walkthrough front walls leave the facade glazing clear below 2.5m while retaining upper and side walls", () => {
  for (const template of ["lounge", "band", "dining", "climbing", "boardgame"]) {
    const shell = createRoomShell({ template });
    shell.updateMatrixWorld(true);
    try {
      const frontWalls = [];
      const sideWalls = [];
      shell.traverse((object) => {
        if (!["building-wall", "climbing-exterior-wall", "boardgame-wall", "clubhouse-wall"].includes(object.name)) return;
        const bounds = new THREE.Box3().setFromObject(object);
        const size = bounds.getSize(new THREE.Vector3());
        if (Math.abs(bounds.getCenter(new THREE.Vector3()).z - 5) < 0.2 && size.x > size.z) frontWalls.push(object);
        else if (size.z > size.x) sideWalls.push(object);
      });
      expect(frontWalls.length).toBeGreaterThanOrEqual(2);
      for (const wall of frontWalls) {
        const bounds = new THREE.Box3().setFromObject(wall);
        const x = bounds.getCenter(new THREE.Vector3()).x;
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.45, 4.5), new THREE.Vector3(0, 0, 1), 0, 1);
        expect(ray.intersectObject(wall, true)).toHaveLength(0);
        expect(bounds.min.y).toBeCloseTo(2.5);
        ray.set(new THREE.Vector3(x, 2.75, 4.5), new THREE.Vector3(0, 0, 1));
        expect(ray.intersectObject(wall, true).length).toBeGreaterThan(0);
      }
      expect(sideWalls.length).toBeGreaterThanOrEqual(2);
      for (const wall of sideWalls) {
        const bounds = new THREE.Box3().setFromObject(wall);
        expect(bounds.min.y).toBeCloseTo(0);
        const center = bounds.getCenter(new THREE.Vector3());
        const direction = center.x < 0 ? -1 : 1;
        const ray = new THREE.Raycaster(new THREE.Vector3(center.x - direction, 1.45, center.z), new THREE.Vector3(direction, 0, 0), 0, 2);
        expect(ray.intersectObject(wall, true).length).toBeGreaterThan(0);
      }
    } finally { disposeObject(shell); }
  }
});


test("every catalog model declares enough vertical clearance for its geometry", () => {
  for (const asset of CATALOG) {
    const model = createFurniture(asset.kind);
    try {
      expect(asset.height).toBeGreaterThan(0);
      expect({ kind: asset.kind, fits: new THREE.Box3().setFromObject(model).max.y <= asset.height + 0.01 })
        .toEqual({ kind: asset.kind, fits: true });
    } finally { disposeObject(model); }
  }
});


test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s front mezzanine windows have a clear opening on both sides", (template) => {
  const shell = createRoomShell({ template, version: 11 });
  const { building } = getRoomLayout(template);
  shell.updateMatrixWorld(true);
  try {
    const windows = shell.getObjectsByProperty("name", "clerestory-glass");
    expect(windows.length).toBeGreaterThan(0);
    for (const pane of windows) {
      expect(pane.material).toMatchObject({ transparent: true, depthWrite: false });
      expect(pane.material.opacity).toBeLessThanOrEqual(0.08);
      expect(pane.castShadow).toBe(false);
      const { x, y } = pane.getWorldPosition(new THREE.Vector3());
      const { width, height } = pane.geometry.parameters;
      for (const direction of [-1, 1]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(x + width / 4, y + height / 4, building.maxZ - direction * 0.8),
          new THREE.Vector3(0, 0, direction), 0, 1.6
        );
        const hits = ray.intersectObject(shell, true);
        expect(hits.map(({ object }) => object.name)).toEqual(["clerestory-glass"]);
      }
    }
    const wall = shell.getObjectByName("upper-front-cladding");
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 3.5, building.maxZ + 0.8), new THREE.Vector3(0, 0, -1), 0, 1.6
    );
    expect(ray.intersectObject(wall)).toHaveLength(1);
  } finally { disposeObject(shell); }
});

test("revised climbing glazing admits daylight and remains a two-sided walking boundary", () => {
  const shell = createRoomShell({ template: "climbing", version: 11 });
  const { building, openings } = getRoomLayout("climbing", 11);
  const opening = openings.back[0];
  const x = opening.x - opening.width / 2 + 0.5;
  const y = opening.sill + 0.7;
  shell.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, building.minZ - 0.5), new THREE.Vector3(0, 0, 1), 0, 1);
  try {
    const hits = ray.intersectObject(shell, true);
    expect(hits.some(({ object }) => object.userData.roomWindow)).toBe(true);
    expect(hits.some(({ object }) => object.castShadow)).toBe(false);
    ray.set(new THREE.Vector3(x, y, building.minZ + 0.5), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(shell, true).some(({ object }) => object.userData.roomWindow)).toBe(true);
    ray.set(new THREE.Vector3(x, opening.sill - 0.5, building.minZ - 0.5), new THREE.Vector3(0, 0, 1));
    expect(ray.intersectObject(shell, true).some(({ object }) => object.castShadow)).toBe(true);
  } finally { disposeObject(shell); }
});


test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s paving has no overlapping lawn or garden stones at the flush terrace", (template) => {
  const shell = createRoomShell({ template, version: 11 });
  const { terrace } = getRoomLayout(template);
  shell.updateMatrixWorld(true);
  const lawn = shell.getObjectByName("island-lawn");
  const gardenPath = shell.getObjectByName("entrance-path");
  try {
    for (const x of [terrace.minX + 0.5, -2, 0, terrace.maxX - 0.5]) {
      for (const z of [terrace.minZ + 0.25, terrace.maxZ - 0.25]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0, -1, 0), 0, 1);
        expect(ray.intersectObject(lawn)).toHaveLength(0);
        expect(ray.intersectObject(gardenPath, true)).toHaveLength(0);
      }
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(terrace.maxX + 1, 0.5, terrace.minZ + 1), new THREE.Vector3(0, -1, 0), 0, 1);
    expect(ray.intersectObject(lawn).length).toBeGreaterThan(0);
  } finally { disposeObject(shell); }
});
