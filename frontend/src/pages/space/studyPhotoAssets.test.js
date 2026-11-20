import * as THREE from "three";
import { STUDY_PHOTO_ASSETS, STUDY_PHOTO_LAYOUTS, createStudyPhotoAsset, createStudyPhotoPresetItems } from "./studyPhotoAssets";
import { CATALOG, canPlace, createInitialRoom } from "./roomState";
import { getRoomLayout } from "./roomLayout";
import { moveWalker } from "./roomNavigation";

function resources(group) {
  const result = new Set();
  group.traverse((object) => {
    if (object.geometry) result.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      result.add(material);
      if (material.map) result.add(material.map);
    }
  });
  return result;
}

function dispose(group) { resources(group).forEach((resource) => resource.dispose()); }

test.each(STUDY_PHOTO_ASSETS)("$kind fits its catalog footprint and owns its resources", (asset) => {
  const first = createStudyPhotoAsset(asset.kind);
  const second = createStudyPhotoAsset(asset.kind);
  try {
    const bounds = new THREE.Box3().setFromObject(first);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-asset.width / 2 - 0.001);
    expect(bounds.max.x).toBeLessThanOrEqual(asset.width / 2 + 0.001);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-asset.depth / 2 - 0.001);
    expect(bounds.max.z).toBeLessThanOrEqual(asset.depth / 2 + 0.001);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bounds.max.y).toBeLessThanOrEqual(asset.height + 0.001);
    const otherResources = resources(second);
    expect([...resources(first)].some((resource) => otherResources.has(resource))).toBe(false);
    expect(first.userData.assetKind).toBe(asset.kind);
  } finally { dispose(first); dispose(second); }
});

test("workstations contain usable worktops and equipment, while studio pieces remain separate assets", () => {
  const desk = createStudyPhotoAsset("studyDesk");
  const edit = createStudyPhotoAsset("photoEditDesk");
  const backdrop = createStudyPhotoAsset("photoBackdrop");
  const softbox = createStudyPhotoAsset("softbox");
  try {
    expect(desk.children.filter((child) => child.name === "monitor-workstation")).toHaveLength(4);
    expect(desk.getObjectByName("cable-tray")).toBeDefined();
    expect(edit.getObjectByName("keyboard")).toBeDefined();
    expect(backdrop.getObjectByName("seamless-curved-backdrop")).toBeDefined();
    expect(backdrop.getObjectByName("softbox-diffuser")).toBeUndefined();
    const lamp = softbox.children.find((child) => child.isSpotLight);
    expect(lamp.userData).toMatchObject({ roomLamp: true, roomLampStrength: 7 });
    expect(createStudyPhotoAsset("sofa")).toBeNull();
  } finally { [desk, edit, backdrop, softbox].forEach(dispose); }
});

test("the movable gallery displays four framed photographs on each outward-facing side", () => {
  const gallery = createStudyPhotoAsset("galleryPartition");
  try {
    gallery.updateMatrixWorld(true);
    const front = gallery.getObjectByName("gallery-front");
    const back = gallery.getObjectByName("gallery-back");
    expect(front.children.filter((object) => object.name === "framed-photo")).toHaveLength(4);
    expect(back.children.filter((object) => object.name === "framed-photo")).toHaveLength(4);
    expect(new THREE.Box3().setFromObject(front).min.z).toBeGreaterThan(0.06);
    expect(new THREE.Box3().setFromObject(back).max.z).toBeLessThan(-0.06);
    expect(front.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(1);
    expect(back.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(-1);
  } finally { dispose(gallery); }
});

test.each(["study", "photo"])("%s preset uses editable catalog items and fits the shared placement contract", (template) => {
  const items = createInitialRoom(template).items;
  expect(items.length).toBeGreaterThan(30);
  expect(items.length).toBeLessThan(400);
  expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  expect(items.filter((item) => item.kind === "musicConsole")).toHaveLength(1);
  expect(items.filter((item) => item.kind === "activityBoard")).toHaveLength(1);
  expect(items.filter((item) => item.kind === "gameChair").every((item) => item.color === undefined || /^#[a-f0-9]{6}$/i.test(item.color))).toBe(true);
  for (const item of items) {
    expect(CATALOG.find((asset) => asset.kind === item.kind)).toBeDefined();
    expect({ id: item.id, valid: canPlace(item, items, template) }).toEqual({ id: item.id, valid: true });
  }
  const copy = createInitialRoom(template).items;
  items[0].x = 999;
  expect(copy[0].x).not.toBe(999);
});

test.each(["study", "photo"])("%s has a clear entrance and a stair route reaching the loft", (template) => {
  const layout = getRoomLayout(template);
  const room = createInitialRoom(template);
  let walker = { x: -2, y: 0, z: 6.8 };
  walker = moveWalker(walker, { x: 0, z: -2.6 }, room);
  expect(walker.z).toBeCloseTo(4.2);
  const stairX = (layout.stairs.minX + layout.stairs.maxX) / 2;
  walker = moveWalker(walker, { x: stairX + 2, z: 0 }, room);
  expect(walker.x).toBeCloseTo(stairX);
  walker = moveWalker(walker, { x: 0, z: layout.stairs.minZ - 0.6 - walker.z }, room);
  expect(walker.z).toBeCloseTo(layout.stairs.minZ - 0.6);
  expect(walker.y).toBeCloseTo(layout.mezzanine.height);
});

test("study and photo retain distinct structural dimensions and loft proportions", () => {
  expect(STUDY_PHOTO_LAYOUTS.study.building.maxX - STUDY_PHOTO_LAYOUTS.study.building.minX).toBe(22);
  expect(STUDY_PHOTO_LAYOUTS.photo.building.maxX - STUDY_PHOTO_LAYOUTS.photo.building.minX).toBe(18);
  expect(STUDY_PHOTO_LAYOUTS.photo.mezzanine.maxX).toBeLessThan(STUDY_PHOTO_LAYOUTS.photo.building.maxX);
  expect(STUDY_PHOTO_LAYOUTS.study.stairs.minX).toBeGreaterThan(0);
  expect(STUDY_PHOTO_LAYOUTS.photo.stairs.maxX).toBeLessThan(0);
  expect(createStudyPhotoPresetItems("unknown")).toEqual([]);
});
