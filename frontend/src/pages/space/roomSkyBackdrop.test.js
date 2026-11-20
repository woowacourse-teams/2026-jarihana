import * as THREE from "three";
import { createRoomSkyBackdrop, frameRoomBackdrop } from "./roomSkyBackdrop";

test("uses the preview camera's pan and rotation for the landscape", () => {
  const preview = new THREE.OrthographicCamera(-12, 12, 6, -6);
  preview.position.set(10, 25, 30);
  preview.lookAt(-3, 1, 4);
  const backdrop = new THREE.PerspectiveCamera(68, 1);

  frameRoomBackdrop(backdrop, preview);

  expect(backdrop.position).toEqual(preview.position);
  expect(backdrop.quaternion.toArray()).toEqual(preview.quaternion.toArray());
  expect(backdrop.aspect).toBe(2);
  expect(backdrop.fov).toBe(44);
});

test("turns the sky with the player without adding parallax during walking", () => {
  const player = new THREE.PerspectiveCamera(58, 1.5);
  const backdrop = new THREE.PerspectiveCamera();
  const sky = createRoomSkyBackdrop();
  sky.update({ phase: "night", weather: "clear" });

  function projectSkyPoint() {
    frameRoomBackdrop(backdrop, player);
    sky.frame(backdrop, false);
    backdrop.updateMatrixWorld();
    return new THREE.Vector3(0, 250, -1000).add(sky.mesh.position).project(backdrop);
  }

  const original = projectSkyPoint();
  player.position.set(5, 1, 10);
  expect(projectSkyPoint().distanceTo(original)).toBeLessThan(1e-8);
  player.rotateY(0.3);
  expect(projectSkyPoint().x).not.toBeCloseTo(original.x);

  sky.frame(backdrop, true);
  expect(sky.mesh.visible).toBe(false);
  sky.dispose();
});
