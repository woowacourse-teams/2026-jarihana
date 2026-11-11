import * as THREE from "three";
import { ROOM_LIGHT_SWITCH_ID } from "./clubhouseInteractions";

const LIGHT_COLOR = "#ffedce";

function box(parent, width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addCeilingFixture(group, x, z, ceiling, name) {
  const y = ceiling - 0.28;
  // The room-wide diffuse fill lights the interior. These fixtures show its state.
  const fixture = new THREE.Group();
  fixture.name = `${name}-fixture`;
  fixture.userData.walkthroughOnly = true;
  box(fixture, 0.9, 0.09, 0.55,
    new THREE.MeshStandardMaterial({ color: "#d9d0bd", roughness: 0.65 }), x, y + 0.08, z);
  const diffuser = box(fixture, 0.81, 0.025, 0.46,
    new THREE.MeshStandardMaterial({ color: "#fff6e5", emissive: LIGHT_COLOR,
      emissiveIntensity: 0.7, roughness: 0.85 }), x, y + 0.024, z);
  diffuser.userData.roomGeneralBulb = true;
  group.add(fixture);
}

function createWallSwitch(building) {
  const control = new THREE.Group();
  control.name = "room-general-light-switch";
  control.userData.itemId = ROOM_LIGHT_SWITCH_ID;
  control.userData.walkthroughOnly = true;
  control.position.set(-0.38, 1.35, building.maxZ - 0.11);
  control.rotation.y = Math.PI;
  const plate = new THREE.MeshStandardMaterial({ color: "#f5f0e6", roughness: 0.62 });
  const trim = new THREE.MeshStandardMaterial({ color: "#726d64", metalness: 0.15, roughness: 0.7 });
  box(control, 0.23, 0.39, 0.055, trim, 0, 0, 0);
  box(control, 0.21, 0.37, 0.055, plate, 0, 0, 0.02);
  const rocker = box(control, 0.14, 0.2, 0.045,
    new THREE.MeshStandardMaterial({ color: "#ded9cd", roughness: 0.55 }), 0, -0.025, 0.057);
  rocker.rotation.x = -0.12;
  const status = box(control, 0.09, 0.025, 0.012,
    new THREE.MeshStandardMaterial({ color: "#fff2c8", emissive: LIGHT_COLOR,
      emissiveIntensity: 0.7, roughness: 0.5 }), 0, 0.132, 0.052);
  status.userData.roomGeneralBulb = true;
  return control;
}

export function createRoomCeilingLighting(layout) {
  const group = new THREE.Group();
  group.name = "room-ceiling-lighting";
  const { building, mezzanine } = layout;
  const width = building.maxX - building.minX;
  const depth = building.maxZ - building.minZ;
  for (const fx of [0.25, 0.75]) {
    for (const fz of [0.25, 0.75]) {
      const x = building.minX + width * fx;
      const z = building.minZ + depth * fz;
      const belowLoft = mezzanine && x >= mezzanine.minX && x <= mezzanine.maxX &&
        z >= mezzanine.minZ && z <= mezzanine.maxZ;
      const ceiling = belowLoft ? mezzanine.height - 0.18 :
        (building.wingHeight && x > 4 ? building.wingHeight : building.height);
      addCeilingFixture(group, x, z, ceiling, `room-general-ground-${fx}-${fz}`);
    }
  }
  if (mezzanine) {
    const loftWidth = mezzanine.maxX - mezzanine.minX;
    for (const fraction of [0.25, 0.75]) {
      addCeilingFixture(group, mezzanine.minX + loftWidth * fraction,
        (mezzanine.minZ + mezzanine.maxZ) / 2, building.height, `room-general-loft-${fraction}`);
    }
  }
  group.add(createWallSwitch(building));
  return group;
}
