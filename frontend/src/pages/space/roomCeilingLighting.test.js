import * as THREE from "three";
import { createRoomCeilingLighting } from "./roomCeilingLighting";
import { ROOM_LIGHT_SWITCH_ID } from "./clubhouseInteractions";
import { getRoomLayout } from "./roomLayout";
import { pickRoomItem } from "./roomPicking";

function dispose(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
    if (object.isLight) object.dispose();
  });
}

test.each(["climbing", "boardgame", "band", "dining", "study", "photo", "lounge"])(
  "%s has ground and loft fixtures without extra real-time lights", (template) => {
    const layout = getRoomLayout(template);
    const group = createRoomCeilingLighting(layout);
    const fixtures = group.children.filter((object) => object.name.endsWith("-fixture"));
    expect(fixtures).toHaveLength(layout.mezzanine ? 6 : 4);
    group.traverse((object) => { expect(object.isLight).toBeUndefined(); });
    for (const fixture of fixtures) {
      expect(fixture.userData.walkthroughOnly).toBe(true);
      const bulb = fixture.children.find((object) => object.userData.roomGeneralBulb);
      expect(bulb.position.x).toBeGreaterThan(layout.building.minX);
      expect(bulb.position.x).toBeLessThan(layout.building.maxX);
      expect(bulb.position.y).toBeLessThan(layout.building.height);
      expect(bulb.position.z).toBeGreaterThan(layout.building.minZ);
      expect(bulb.position.z).toBeLessThan(layout.building.maxZ);
      if (fixture.name.includes("-loft-")) expect(bulb.position.y).toBeGreaterThan(layout.mezzanine.height);
    }
    dispose(group);
  }
);

test("the interior entrance switch can be raycast from eye height and routes to the shared action", () => {
  const layout = getRoomLayout("boardgame");
  const group = createRoomCeilingLighting(layout);
  const control = group.getObjectByName("room-general-light-switch");
  expect(ROOM_LIGHT_SWITCH_ID).toEqual(expect.any(String));
  expect(control.userData.walkthroughOnly).toBe(true);
  expect(control.userData.itemId).toBe(ROOM_LIGHT_SWITCH_ID);
  expect(control.position.z).toBeLessThan(layout.building.maxZ);
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(control.position.x, 1.45, layout.building.maxZ - 2),
    new THREE.Vector3(0, 0, 1), 0, 3);
  expect(pickRoomItem(ray.intersectObject(group, true), false)).toBe(ROOM_LIGHT_SWITCH_ID);
  const indicators = [];
  control.traverse((object) => {
    if (object.userData.roomGeneralBulb) indicators.push(object);
  });
  expect(indicators).toHaveLength(1);
  expect(indicators[0].material.emissiveIntensity).toBeGreaterThan(0);
  control.visible = false;
  expect(pickRoomItem(ray.intersectObject(group, true), false)).toBeNull();
  dispose(group);
});
