import * as THREE from "three";
import { createRoomSkyOrb } from "./roomSkyOrb";

test("the sun follows a world direction as the camera turns and stays distant as it moves", () => {
  const { orb, update, frame, dispose } = createRoomSkyOrb();
  const sun = new THREE.Vector3(0, 8, -28);
  const camera = new THREE.PerspectiveCamera(62, 1.5, 16, 1200);
  update({ phase: "dusk", weather: "clear" }, sun, false);

  const project = () => {
    camera.updateMatrixWorld();
    frame(camera);
    return orb.position.clone().project(camera);
  };
  camera.lookAt(sun);
  const centered = project();
  expect(centered.x).toBeCloseTo(0);
  expect(centered.y).toBeCloseTo(0);
  camera.position.set(30, 2, -12);
  expect(project().distanceTo(centered)).toBeLessThan(1e-6);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(1, 0, -0.3)));
  expect(Math.abs(project().x)).toBeGreaterThan(1);
  expect(orb.position.clone().sub(camera.position).normalize().distanceTo(sun.clone().normalize())).toBeLessThan(1e-6);
  dispose();
});

test("the moon is visible in clear night weather and stays hidden on the web frontage", () => {
  const { orb, update, dispose } = createRoomSkyOrb();
  const light = new THREE.Vector3(0, 12, -28);
  const clearNight = { phase: "night", weather: "clear" };
  update(clearNight, light, false);
  expect(orb.visible).toBe(true);
  expect(orb.material.uniforms.moon.value).toBe(1);
  update({ ...clearNight, weather: "cloudy" }, light, false);
  expect(orb.visible).toBe(false);
  update(clearNight, light, true);
  expect(orb.visible).toBe(false);
  dispose();
});
