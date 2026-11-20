import * as THREE from "three";
import { getRoomLayout } from "./roomLayout";
import { getDioramaBounds } from "./islandLayout";
import { frameRoomCamera, frameRoomCameraFlight, frameRoomFrontCamera, setRoomFrontLens } from "./roomCamera";
import { DEFAULT_ROOM_ZOOM } from "./roomCameraZoom";

function framed(template, options = {}) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const layout = getRoomLayout(template);
  frameRoomCamera(camera, { layout, template, aspect: 1361 / 509, ...options });
  return { camera, layout };
}

function framedFront(template, aspect, layout = getRoomLayout(template)) {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 160);
  const lens = frameRoomFrontCamera(camera, { layout, template, aspect });
  setRoomFrontLens(camera, lens, aspect, 0);
  return camera;
}

function projected(camera, area, minY, maxY) {
  const bounds = new THREE.Box2();
  for (const x of [area.minX, area.maxX]) for (const y of [minY, maxY]) for (const z of [area.minZ, area.maxZ]) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
  }
  return bounds;
}

function expectFits(bounds) {
  expect(bounds.min.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.max.x).toBeLessThanOrEqual(1);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.max.y).toBeLessThanOrEqual(1);
}

const TEMPLATES = ["lounge", "climbing", "boardgame", "dining", "band", "study", "photo"];

test.each(TEMPLATES)("%s edit view fills the canvas with the building while keeping the whole-site view", (template) => {
  for (const aspect of [1.6, 0.65]) {
    const options = { aspect, zoom: DEFAULT_ROOM_ZOOM };
    const { camera, layout } = framed(template, { ...options, focusBuilding: true });
    const { building, entrance } = layout;
    const bounds = projected(camera, building, 0, building.height)
      .union(projected(camera, entrance, -0.2, 2.8));
    expectFits(bounds);
    const size = bounds.getSize(new THREE.Vector2());
    expect(Math.max(size.x, size.y)).toBeGreaterThan(1.65);

    const site = { ...options, view: "site" };
    expect(framed(template, { ...site, focusBuilding: true }).camera.projectionMatrix.elements)
      .toEqual(framed(template, site).camera.projectionMatrix.elements);
  }
});

test.each([false, true])("camera flight matches both screen positions when closing is %s", (closing) => {
  const heroRect = { left: 48, top: 77, width: 1240, height: 550 };
  const canvasRect = { left: 0, top: 0, width: 1336, height: 900 };
  const hero = framedFront("climbing", heroRect.width / heroRect.height);
  const immersive = framed("climbing", { aspect: canvasRect.width / canvasRect.height }).camera;
  const [from, to] = closing ? [immersive, hero] : [hero, immersive];
  const [fromRect, toRect] = closing ? [canvasRect, heroRect] : [heroRect, canvasRect];
  const flight = hero.clone();
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 2, -4)];
  const screenPoint = (point, camera, rect) => {
    const projectedPoint = point.clone().project(camera);
    return [rect.left + (projectedPoint.x + 1) * rect.width / 2, rect.top + (1 - projectedPoint.y) * rect.height / 2];
  };

  for (const [progress, camera, rect] of [[0, from, fromRect], [1, to, toRect]]) {
    frameRoomCameraFlight(flight, from, to, fromRect, toRect, canvasRect, progress);
    for (const point of points) {
      const [x, y] = screenPoint(point, flight, canvasRect);
      const [expectedX, expectedY] = screenPoint(point, camera, rect);
      expect(x).toBeCloseTo(expectedX);
      expect(y).toBeCloseTo(expectedY);
    }
  }
  frameRoomCameraFlight(flight, from, to, fromRect, toRect, canvasRect, 0.5);
  expect(flight.position.y).toBeCloseTo((hero.position.y + immersive.position.y) / 2);
  const tilt = flight.getWorldDirection(new THREE.Vector3()).y;
  expect(tilt).toBeLessThan(0);
  expect(tilt).toBeGreaterThan(immersive.getWorldDirection(new THREE.Vector3()).y);
});

test("camera flight matches screen positions from a moved perspective preview to the orthographic room", () => {
  const heroRect = { left: 0, top: 72, width: 1200, height: 420 };
  const fullRect = { left: 0, top: 0, width: 1200, height: 800 };
  const from = new THREE.PerspectiveCamera(28, heroRect.width / heroRect.height, 0.08, 160);
  from.position.set(-9, 3, 17);
  from.lookAt(2, 3, -4);
  from.updateMatrixWorld();
  const { camera: to } = framed("boardgame", { aspect: fullRect.width / fullRect.height });
  const flight = new THREE.PerspectiveCamera();
  const project = (point, camera, rect) => {
    const view = point.clone().project(camera);
    return new THREE.Vector2(rect.left + (view.x + 1) * rect.width / 2, rect.top + (1 - view.y) * rect.height / 2);
  };
  for (const [progress, endpoint, rect] of [[0, from, heroRect], [1, to, fullRect]]) {
    frameRoomCameraFlight(flight, from, to, heroRect, fullRect, fullRect, progress);
    for (const point of [new THREE.Vector3(1, 2, 4), new THREE.Vector3(-3, 4, -5)]) {
      expect(project(point, flight, fullRect).distanceTo(project(point, endpoint, rect))).toBeLessThan(1e-8);
    }
  }
});

test.each(TEMPLATES)("%s desktop shows the furnished interior, lawn and floating rock tip together", (template) => {
  const { camera, layout } = framed(template);
  expect(layout.island).toBeDefined();
  expectFits(projected(camera, layout.building, 0, layout.building.height));
  expectFits(projected(camera, { minX: -3.5, maxX: -0.5, minZ: 5, maxZ: 7.2 }, 0, 2.8));
  const { surface, walkable: lawn, bottomY } = layout.island;
  expectFits(projected(camera, lawn, 0, 0));
  const centerZ = (surface.minZ + surface.maxZ) / 2;
  expectFits(projected(camera, { minX: -3, maxX: 3, minZ: centerZ - 2, maxZ: centerZ + 2 }, bottomY, 0));
  const occupied = projected(camera, lawn, 0, 0).union(projected(camera, layout.building, 0, layout.building.height));
  const size = occupied.getSize(new THREE.Vector2());
  expect(Math.max(size.x, size.y)).toBeGreaterThan(1.6);
  expect(projected(camera, layout.building, 0, 0).getSize(new THREE.Vector2()).x).toBeGreaterThan(0.5);
  const site = framed(template, { view: "site" }).camera;
  expect(camera.top - camera.bottom).toBeLessThan(site.top - site.bottom);
  expect(camera.position.x < 0).toBe(layout.walls.some((wall) => wall.x === layout.building.minX && wall.cutaway));
});

test.each(TEMPLATES)("%s portrait preserves the complete building and floating island silhouette", (template) => {
  const { camera, layout } = framed(template, { aspect: 0.65 });
  expectFits(projected(camera, layout.building, -0.35, layout.building.height + 0.4));
  expectFits(projected(camera, layout.island.surface, layout.island.bottomY, 0.5));
});

test.each(TEMPLATES.flatMap((template) => ["site", "top"].map((view) => [template, view])))(
  "%s %s view fits the entire lawn perimeter and cliff underside", (template, view) => {
    const { camera, layout } = framed(template, { view });
    expectFits(projected(camera, layout.building, -0.35, layout.building.height + 0.4));
    expectFits(projected(camera, layout.island.surface, layout.island.bottomY, 0.5));
    expectFits(projected(camera, { ...layout.island.surface, maxZ: layout.island.walkable.minZ }, 0, 7));
  }
);

test("mezzanine stays fitted independently from the island and zoom remains relative", () => {
  const { camera, layout } = framed("boardgame", { floorView: "mezzanine" });
  expectFits(projected(camera, layout.mezzanine, layout.mezzanine.height - 0.3, layout.mezzanine.height + 2.8));
  const withoutIsland = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  frameRoomCamera(withoutIsland, { layout: { ...layout, island: undefined }, template: "boardgame", floorView: "mezzanine", aspect: 1361 / 509 });
  expect(withoutIsland.projectionMatrix.elements).toEqual(camera.projectionMatrix.elements);
  const zoomed = framed("boardgame", { floorView: "mezzanine", zoom: 1.5 }).camera;
  expect(zoomed.top - zoomed.bottom).toBeCloseTo((camera.top - camera.bottom) / 1.5);
});

test.each(TEMPLATES.flatMap((template) => [0.65, 336 / 329, 1280 / 550, 1280 / 435, 6].map((aspect) => [template, aspect])))(
  "%s front at aspect %s fits the facade and the paving edge", (template, aspect) => {
    const layout = getRoomLayout(template);
    const camera = framedFront(template, aspect, layout);
    const { building } = layout;
    const silhouette = projected(camera, building, 0, building.height + 0.6);
    expectFits(silhouette);
    expect(camera.position.x).toBeCloseTo((building.minX + building.maxX) / 2);
    expect(camera.position.y).toBeCloseTo(1.45);
    const apron = getDioramaBounds(layout);
    expect(camera.position.z - apron.maxZ).toBeLessThan(9);
    expect(camera.position.z).toBeGreaterThan(apron.maxZ);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    const facade = { ...building, minZ: building.maxZ };
    const top = projected(camera, facade, building.height, building.height);
    const bottom = projected(camera, facade, 0, 0);
    expect(top.min.y).toBeCloseTo(top.max.y);
    expect(top.min.x).toBeCloseTo(bottom.min.x);
    expect(top.max.x).toBeCloseTo(bottom.max.x);
    expect(top.min.x).toBeCloseTo(-top.max.x);
    const paving = projected(camera, apron, apron.minY, apron.maxY);
    if (layout.terrace) {
      const { minX, maxX, minZ, maxZ } = layout.terrace;
      paving.union(projected(camera, { minX: minX - 0.16, maxX: maxX + 0.16, minZ, maxZ: maxZ + 0.16 }, -0.22, 0.14));
    }
    expect(paving.min.y).toBeGreaterThan(-0.98);
    const size = silhouette.getSize(new THREE.Vector2());
    expect(Math.max(size.x, size.y)).toBeGreaterThan(aspect > 4 ? 1.3 : 1.45);
  }
);

test.each(TEMPLATES)("%s front framing ignores the island outside the entrance", (template) => {
  const layout = getRoomLayout(template);
  const aspect = 1280 / 435;
  const camera = framedFront(template, aspect, layout);
  const expandedYard = framedFront(template, aspect, { ...layout, island: { ...layout.island,
    surface: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } } });
  expect(expandedYard.position).toEqual(camera.position);
  expect(expandedYard.projectionMatrix.elements).toEqual(camera.projectionMatrix.elements);
});

test.each([0.46, 1.47])("exterior fits the terrace and parapet at aspect %s", (aspect) => {
  const { camera, layout } = framed("band", { view: "exterior", aspect });
  expectFits(projected(camera, layout.building, -0.35, layout.building.height + 1.1));
  expectFits(projected(camera, layout.terrace, -0.3, 1.8));
});
