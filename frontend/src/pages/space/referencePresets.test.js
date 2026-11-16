import * as THREE from "three";
import { createInitialRoom, canPlace, validateRoom } from "./roomState";
import { createReferenceFurnishing, REFERENCE_FURNISHINGS } from "./referenceFurnishings";
import { disposeObject } from "./roomModels";

test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s reference layout can be edited and saved without overlap or blocked reserved paths", (template) => {
  const room = createInitialRoom(template);
  expect(room.items.filter((item) => !canPlace(item, room.items, template)).map(({ id }) => id)).toEqual([]);
  expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
});

beforeAll(() => jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null));
afterAll(() => jest.restoreAllMocks());

test.each(REFERENCE_FURNISHINGS)("$kind fits its editable footprint including foliage and fixtures", (asset) => {
  const object = createReferenceFurnishing(asset.kind);
  try {
    const bounds = new THREE.Box3().setFromObject(object);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-asset.width / 2 - 0.001);
    expect(bounds.max.x).toBeLessThanOrEqual(asset.width / 2 + 0.001);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-asset.depth / 2 - 0.001);
    expect(bounds.max.z).toBeLessThanOrEqual(asset.depth / 2 + 0.001);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bounds.max.y).toBeLessThanOrEqual(asset.height + 0.001);
  } finally { disposeObject(object); }
});

test("custom finishes and pattern scale survive saving; old documents retain theme defaults", () => {
  const room = createInitialRoom("boardgame");
  room.atmosphere = { ...room.atmosphere, wallMaterial: "brick", floorMaterial: "herringbone", wallPatternScale: 0.5, floorPatternScale: 2 };
  expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
  const old = JSON.parse(JSON.stringify(room));
  for (const key of ["wallMaterial", "floorMaterial", "wallPatternScale", "floorPatternScale"]) delete old.atmosphere[key];
  expect(validateRoom(old).atmosphere).toMatchObject({ wallMaterial: "auto", floorMaterial: "auto", wallPatternScale: 1, floorPatternScale: 1 });
  for (const invalid of [{ wallMaterial: "unknown" }, { floorPatternScale: 0 }, { floorPatternScale: "1" }]) {
    expect(validateRoom({ ...room, atmosphere: { ...room.atmosphere, ...invalid } })).toBeNull();
  }
});
