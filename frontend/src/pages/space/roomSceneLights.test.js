import * as THREE from "three";
import { createRoomSceneLights } from "./roomSceneLights";

function renderedLights(scene, camera = new THREE.PerspectiveCamera()) {
  const lights = [];
  scene.traverseVisible((object) => {
    if (object.isLight && object.layers.test(camera.layers)) lights.push(object);
  });
  return lights;
}

function setup() {
  const scene = new THREE.Scene();
  const floor = new THREE.Group();
  const fixture = new THREE.Group();
  const light = new THREE.PointLight("#ffd49a", 7, 12, 1);
  light.userData.roomLamp = true;
  light.userData.roomLampStrength = light.intensity;
  fixture.add(light);
  floor.add(fixture);
  scene.add(floor);
  const runtime = createRoomSceneLights(scene);
  return { scene, floor, fixture, light, runtime };
}

test("hiding a floor silences its fixture without changing the rendered light count", () => {
  const { scene, floor, light, runtime } = setup();
  const revision = runtime.sync();
  const [proxy] = renderedLights(scene);
  expect(proxy).not.toBe(light);
  expect(proxy.intensity).toBe(7);
  expect(proxy.userData.roomLamp).toBeUndefined();
  expect(light.layers.mask).toBe(0);

  floor.visible = false;
  expect(runtime.sync()).toBe(revision);
  expect(renderedLights(scene)).toEqual([proxy]);
  expect(proxy.intensity).toBe(0);

  floor.visible = true;
  expect(runtime.sync()).toBe(revision);
  expect(renderedLights(scene)).toEqual([proxy]);
  expect(proxy.intensity).toBe(7);
  runtime.dispose();
});

test("a moved fixture and lighting changes retain the source's world transform and photometric values", () => {
  const { scene, floor, fixture, light, runtime } = setup();
  scene.position.set(2, -1, 4);
  floor.position.set(3, 4, -2);
  floor.rotation.y = 0.7;
  fixture.position.set(-1, 2, 4);
  light.position.set(0.5, 2, 0.8);
  runtime.sync();
  const [proxy] = renderedLights(scene);
  expect(proxy.getWorldPosition(new THREE.Vector3()).distanceTo(light.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);

  fixture.position.set(5, 1, -3);
  light.color.set("#c3e4ff");
  light.intensity = 2.3;
  light.distance = 19;
  light.decay = 1.5;
  runtime.sync();
  expect(proxy.getWorldPosition(new THREE.Vector3()).distanceTo(light.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  expect(proxy.color.equals(light.color)).toBe(true);
  expect(proxy).toMatchObject({ intensity: 2.3, distance: 19, decay: 1.5 });
  runtime.dispose();
});

test.each([THREE.DirectionalLight, THREE.SpotLight])("copies %p target world position when its furniture moves", (Light) => {
  const scene = new THREE.Scene();
  const fixture = new THREE.Group();
  const light = new Light("#fff0da", 4);
  light.position.set(0.5, 2, 1);
  light.target.position.set(0, 0, -2);
  fixture.add(light, light.target);
  fixture.position.set(3, 1, 5);
  fixture.rotation.y = 1.2;
  scene.add(fixture);
  const runtime = createRoomSceneLights(scene);
  runtime.sync();
  const [proxy] = renderedLights(scene);
  const target = new THREE.Vector3();
  expect(proxy.target.getWorldPosition(target).distanceTo(light.target.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  expect(proxy.target).not.toBe(light.target);

  fixture.position.set(-3, 2, 4);
  light.target.position.set(1, 0.2, -4);
  if (light.isSpotLight) {
    light.angle = 0.7;
    light.penumbra = 0.4;
  }
  runtime.sync();
  expect(proxy.target.getWorldPosition(target).distanceTo(light.target.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  if (light.isSpotLight) expect(proxy).toMatchObject({ angle: 0.7, penumbra: 0.4 });
  runtime.dispose();
});

test("source layer filtering, global lights and shadow-casting lights keep their original behavior", () => {
  const { scene, floor, light, runtime } = setup();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const globalFill = new THREE.HemisphereLight();
  const shadowFixture = new THREE.SpotLight();
  shadowFixture.castShadow = true;
  floor.add(shadowFixture);
  scene.add(sun, globalFill);
  light.layers.set(2);
  runtime.sync();
  expect(renderedLights(scene)).toEqual(expect.arrayContaining([sun, globalFill, shadowFixture]));
  expect(renderedLights(scene)).toHaveLength(3);
  expect(sun.layers.mask).toBe(1);
  expect(globalFill.layers.mask).toBe(1);
  expect(shadowFixture.layers.mask).toBe(1);

  const layerCamera = new THREE.PerspectiveCamera();
  layerCamera.layers.set(2);
  expect(renderedLights(scene, layerCamera)).toHaveLength(1);
  runtime.dispose();
  expect(light.layers.mask).toBe(4);
});

test("removing furniture releases its proxy and disposal restores surviving source masks", () => {
  const { scene, floor, fixture, light, runtime } = setup();
  const firstRevision = runtime.sync();
  const [proxy] = renderedLights(scene);
  const releaseProxy = jest.fn();
  proxy.addEventListener("dispose", releaseProxy);
  floor.remove(fixture);
  expect(runtime.sync()).toBeGreaterThan(firstRevision);
  expect(renderedLights(scene)).toHaveLength(0);
  expect(releaseProxy).toHaveBeenCalledTimes(1);
  expect(light.layers.mask).toBe(1);

  floor.add(fixture);
  runtime.sync();
  expect(renderedLights(scene)).toHaveLength(1);
  runtime.dispose();
  runtime.dispose();
  expect(light.layers.mask).toBe(1);
  expect(renderedLights(scene)).toEqual([light]);
  expect(scene.children).toEqual([floor]);
});

test("enabling shadows returns a managed fixture to its source light", () => {
  const { scene, light, runtime } = setup();
  const revision = runtime.sync();
  light.castShadow = true;
  expect(runtime.sync()).toBeGreaterThan(revision);
  expect(renderedLights(scene)).toEqual([light]);
  expect(light.layers.mask).toBe(1);
  runtime.dispose();
});

test("replacing a fixture with the same light type keeps the shader count revision stable", () => {
  const { scene, fixture, light, runtime } = setup();
  const revision = runtime.sync();
  fixture.remove(light);
  const replacement = new THREE.PointLight("#aaccff", 3);
  fixture.add(replacement);
  expect(runtime.sync()).toBe(revision);
  expect(renderedLights(scene)).toHaveLength(1);
  expect(renderedLights(scene)[0].intensity).toBe(3);

  replacement.visible = false;
  expect(runtime.sync()).toBe(revision);
  expect(renderedLights(scene)).toHaveLength(1);
  expect(renderedLights(scene)[0].intensity).toBe(0);
  runtime.dispose();
});

test("refresh follows a revealing and moving island without rediscovering scene objects", () => {
  const { scene, floor, light, runtime } = setup();
  floor.visible = false;
  light.position.set(3, 1.2, 6);
  runtime.sync();
  const [proxy] = renderedLights(scene);
  expect(proxy.intensity).toBe(0);
  const traversal = jest.spyOn(floor, "traverse");

  floor.visible = true;
  floor.scale.set(0.4, 0.7, 0.5);
  floor.position.set(0, -0.04, -2);
  runtime.refresh();
  expect(proxy.intensity).toBe(7);
  expect(proxy.getWorldPosition(new THREE.Vector3()).distanceTo(light.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  expect(traversal).not.toHaveBeenCalled();

  floor.scale.set(1, 1, 1);
  floor.position.set(0, 0, 0);
  runtime.refresh();
  expect(proxy.getWorldPosition(new THREE.Vector3()).distanceTo(light.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  floor.visible = false;
  runtime.refresh();
  expect(proxy.intensity).toBe(0);
  expect(traversal).not.toHaveBeenCalled();
  runtime.dispose();
});
