import { applyAssetAppearance } from "./assetAppearance";
import { createClubhouseArchitecture } from "./clubhouseArchitecture";
import { applyBakedFurnitureOcclusion, applyBakedWallOcclusion } from "./roomBakedOcclusion";
import { getRoomLayout } from "./roomLayout";
import { createFurniture, disposeObject } from "./roomModels";

function bakedMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.material?.aoMap) meshes.push(object);
  });
  return meshes;
}

function occlusionValues(mesh) {
  const uv = mesh.geometry.getAttribute("uv1");
  const { data, width, height } = mesh.material.aoMap.image;
  return Array.from({ length: uv.count }, (_, i) => data[Math.floor(uv.getY(i) * height) * width + Math.floor(uv.getX(i) * width)]);
}

test("the furniture atlas contains model-specific contact shading and travels with recolored furniture", () => {
  const shelf = createFurniture("openDisplayShelf");
  const sofa = createFurniture("clubSofa");
  applyAssetAppearance(shelf, { color: "#345644", finish: "oak" });
  applyBakedFurnitureOcclusion(shelf, "openDisplayShelf");
  applyBakedFurnitureOcclusion(sofa, "clubSofa");

  const [back, ...shelves] = bakedMeshes(shelf);
  expect(shelves.length).toBeGreaterThan(0);
  expect(back.material.color.getHexString()).toBe("345644");
  expect(back.material.map.channel).toBe(0);
  const atlas = back.material.aoMap;
  expect(atlas.channel).toBe(1);
  expect(atlas).toBe(bakedMeshes(sofa)[0].material.aoMap);
  const before = occlusionValues(back);
  expect(Math.min(...before)).toBeLessThan(220);
  expect(Math.max(...before)).toBe(255);

  shelf.position.set(9, 0.25, -3);
  shelf.rotation.y = Math.PI / 2;
  shelf.updateMatrixWorld(true);
  expect(occlusionValues(back)).toEqual(before);
});

test("deleting one baked asset leaves the atlas available for other and newly placed furniture", () => {
  const first = createFurniture("clubSofa");
  const second = createFurniture("clubSofa");
  applyBakedFurnitureOcclusion(first, "clubSofa");
  applyBakedFurnitureOcclusion(second, "clubSofa");
  const atlas = bakedMeshes(first)[0].material.aoMap;
  const onAtlasDispose = jest.fn();
  atlas.addEventListener("dispose", onAtlasDispose);
  disposeObject(first);
  const added = createFurniture("clubSofa", { color: "#b4674d" });
  applyBakedFurnitureOcclusion(added, "clubSofa");

  expect(onAtlasDispose).not.toHaveBeenCalled();
  expect(bakedMeshes(second)[0].material.aoMap).toBe(atlas);
  expect(bakedMeshes(added)[0].material.aoMap).toBe(atlas);
  atlas.removeEventListener("dispose", onAtlasDispose);
  disposeObject(second);
  disposeObject(added);
});

test("fixed wall surfaces use the layout bake without changing window or ceiling materials", () => {
  const layout = getRoomLayout("climbing", 11);
  const root = createClubhouseArchitecture(layout, { template: "climbing", floorColor: "#a9a393", wallColor: "#adac9b" });
  applyBakedWallOcclusion(root, "climbing", 11);
  const walls = bakedMeshes(root);
  expect(walls.length).toBeGreaterThan(0);
  expect(walls.every((wall) => wall.userData.roomSurface === "wall" && wall.castShadow && wall.receiveShadow)).toBe(true);
  expect(root.getObjectByName("climbing-daylight-window").material.aoMap).toBeNull();
  expect(root.getObjectByName("ceiling").material.aoMap).toBeNull();
});
