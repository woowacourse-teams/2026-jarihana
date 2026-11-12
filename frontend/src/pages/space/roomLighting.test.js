import * as THREE from "three";
import { createRoomLighting } from "./roomLighting";
import { createRoomCeilingLighting } from "./roomCeilingLighting";
import { DEFAULT_ATMOSPHERE, TEMPLATE_ATMOSPHERES } from "./roomState";
import { createRoomShell, disposeObject } from "./roomModels";
import { createBuildingContext } from "./roomBuilding";
import { getRoomLayout } from "./roomLayout";
import { getIslandLayout } from "./islandLayout";

function setup() {
  const scene = new THREE.Scene();
  const update = createRoomLighting(scene);
  const shell = new THREE.Group();
  const lamp = new THREE.PointLight();
  lamp.userData.roomLamp = true;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial());
  bulb.userData.roomBulb = true;
  shell.add(lamp, bulb);
  return { scene, shell, lamp, bulb, update,
    sun: scene.children.find((object) => object.isDirectionalLight),
    dispose() {
      scene.traverse((object) => { if (object.isLight) object.dispose(); });
      lamp.dispose(); bulb.geometry.dispose(); bulb.material.dispose();
    }
  };
}

test("lighting controls extinguish actual lights and bulb emission, then restore without rebuilding", () => {
  const rig = setup();
  const lights = [...rig.scene.children];
  const material = rig.bulb.material;
  rig.update({ ...DEFAULT_ATMOSPHERE, ambient: 0, sunlight: 0, lamps: 0 }, rig.shell);
  expect(rig.scene.children.every((light) => light.intensity === 0)).toBe(true);
  expect(rig.lamp.intensity).toBe(0);
  expect(rig.bulb.material.emissiveIntensity).toBe(0);
  expect(rig.sun.castShadow).toBe(true);
  expect(rig.sun.shadow.intensity).toBe(0);
  rig.update(DEFAULT_ATMOSPHERE, rig.shell);
  expect(rig.scene.children).toEqual(lights);
  expect(rig.bulb.material).toBe(material);
  expect(rig.scene.children.every((light) => light.intensity > 0)).toBe(true);
  expect(rig.lamp.intensity).toBeGreaterThan(0);
  expect(rig.bulb.material.emissiveIntensity).toBeGreaterThan(0);
  expect(rig.sun.castShadow).toBe(true);
  expect(rig.sun.shadow.intensity).toBe(1);
  rig.dispose();
});

test("direction, warmth and shadow controls update rendered-light properties", () => {
  const rig = setup();
  rig.update({ ...DEFAULT_ATMOSPHERE, sunAngle: 0, warmth: 0, shadows: false, shadowSoftness: 0 }, rig.shell);
  expect(rig.sun.position.x).toBeCloseTo(0);
  expect(rig.sun.position.z).toBeGreaterThan(0);
  expect(rig.sun.castShadow).toBe(true);
  expect(rig.sun.shadow.intensity).toBe(0);
  const coolBlue = rig.sun.color.b;
  const hardShadow = rig.sun.shadow.radius;
  rig.update({ ...DEFAULT_ATMOSPHERE, sunAngle: 90, warmth: 100, shadowSoftness: 100 }, rig.shell);
  expect(rig.sun.position.x).toBeGreaterThan(0);
  expect(rig.sun.position.z).toBeCloseTo(0);
  expect(rig.sun.color.b).toBeLessThan(coolBlue);
  expect(rig.lamp.color).toEqual(rig.sun.color);
  expect(rig.bulb.material.emissive).toEqual(rig.sun.color);
  expect(rig.sun.castShadow).toBe(true);
  expect(rig.sun.shadow.intensity).toBe(1);
  expect(rig.sun.shadow.radius).toBeGreaterThan(hardShadow);
  rig.dispose();
});

test.each([undefined, { phase: "night", weather: "clear" }])(
  "shadow controls retain the light topology and suspend unused shadow-map updates (%j)",
  (outdoorLight) => {
    const rig = setup();
    const atmosphere = { ...DEFAULT_ATMOSPHERE, outdoorLight };
    rig.update({ ...atmosphere, shadows: false }, rig.shell);
    expect(rig.sun.castShadow).toBe(true);
    expect(rig.sun.shadow.intensity).toBe(0);
    expect(rig.sun.shadow.autoUpdate).toBe(false);
    expect(rig.sun.shadow.needsUpdate).toBe(true);

    // A first render supplies the sampler; disabled shadows then need no redraws.
    rig.sun.shadow.map = new THREE.WebGLRenderTarget(8, 8);
    rig.sun.shadow.needsUpdate = false;
    for (const settings of [{ shadows: false }, { sunlight: 0 }]) {
      rig.update({ ...atmosphere, ...settings }, rig.shell);
      expect(rig.sun.castShadow).toBe(true);
      expect(rig.sun.shadow.intensity).toBe(0);
      expect(rig.sun.shadow.autoUpdate).toBe(false);
      expect(rig.sun.shadow.needsUpdate).toBe(false);
    }

    rig.update(atmosphere, rig.shell);
    expect(rig.sun.castShadow).toBe(true);
    expect(rig.sun.shadow.intensity).toBe(1);
    expect(rig.sun.shadow.autoUpdate).toBe(true);
    expect(rig.sun.shadow.needsUpdate).toBe(true);
    rig.dispose();
  }
);

test("a replacement shell receives the active lamp settings", () => {
  const rig = setup();
  const nextLamp = new THREE.PointLight();
  nextLamp.userData.roomLamp = true;
  const nextShell = new THREE.Group();
  nextShell.add(nextLamp);
  rig.update({ ...DEFAULT_ATMOSPHERE, lamps: 0 }, rig.shell);
  rig.update({ ...DEFAULT_ATMOSPHERE, lamps: 0 }, nextShell);
  expect(nextLamp.intensity).toBe(0);
  nextLamp.dispose(); rig.dispose();
});

test("tall gym fixtures keep their reach and dim proportionally", () => {
  const rig = setup();
  rig.lamp.userData.roomLampStrength = 12;
  rig.update({ ...DEFAULT_ATMOSPHERE, lamps: 50 }, rig.shell);
  expect(rig.lamp.intensity).toBe(6);
  rig.update({ ...DEFAULT_ATMOSPHERE, lamps: 0 }, rig.shell);
  expect(rig.lamp.intensity).toBe(0);
  rig.dispose();
});

test("front preview illuminates furniture from the entrance and restores saved lighting on expansion", () => {
  const rig = setup();
  const atmosphere = { ...DEFAULT_ATMOSPHERE, ambient: 60, warmth: 80 };
  const saved = JSON.stringify(atmosphere);
  rig.update(atmosphere, rig.shell);
  const fill = rig.scene.children.filter((light) => light.isDirectionalLight)[1];
  const original = { position: fill.position.clone(), color: fill.color.clone(), intensity: fill.intensity };
  const lampIntensity = rig.lamp.intensity;
  rig.update(atmosphere, rig.shell, true);
  expect(fill.position.z).toBeGreaterThan(0);
  expect(fill.intensity).toBeGreaterThan(original.intensity);
  expect(fill.color.b).toBeLessThan(original.color.b);
  expect(rig.lamp.intensity).toBe(lampIntensity);
  rig.update({ ...atmosphere, ambient: 0 }, rig.shell, true);
  expect(fill.intensity).toBe(0);
  rig.update(atmosphere, rig.shell, false);
  expect(fill.position).toEqual(original.position);
  expect(fill.color).toEqual(original.color);
  expect(fill.intensity).toBe(original.intensity);
  expect(JSON.stringify(atmosphere)).toBe(saved);
  rig.dispose();
});

test("outdoor night turns sunlight blue and makes installed warm lamps stand out", () => {
  const rig = setup();
  const atmosphere = { ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "day", weather: "clear", daylightProgress: 0.5 } };
  rig.update(atmosphere, rig.shell);
  const day = { sun: rig.sun.intensity, ambient: rig.scene.getObjectByName("room-skylight").intensity,
    lamp: rig.lamp.intensity, bulb: rig.bulb.material.emissiveIntensity };
  rig.update({ ...atmosphere, outdoorLight: { ...atmosphere.outdoorLight, phase: "night" } }, rig.shell);
  expect(rig.sun.intensity).toBeLessThan(day.sun);
  expect(rig.sun.color.b).toBeGreaterThan(rig.sun.color.r);
  expect(rig.scene.getObjectByName("room-skylight").intensity).toBeLessThan(day.ambient);
  expect(rig.lamp.intensity).toBeGreaterThan(day.lamp);
  expect(rig.lamp.color.r).toBeGreaterThan(rig.lamp.color.b);
  expect(rig.bulb.material.emissiveIntensity).toBeGreaterThan(day.bulb);
  const warmLampBlue = rig.lamp.color.b;
  rig.update({ ...atmosphere, warmth: 0, outdoorLight: { ...atmosphere.outdoorLight, phase: "night" } }, rig.shell);
  expect(rig.lamp.color.b).toBeGreaterThan(warmLampBlue);
  rig.update({ ...atmosphere, ambient: 0, sunlight: 0, lamps: 0 }, rig.shell);
  expect(rig.scene.children.every((light) => light.intensity === 0)).toBe(true);
  expect(rig.lamp.intensity).toBe(0);
  expect(rig.bulb.material.emissiveIntensity).toBe(0);
  rig.dispose();
});

test.each(["climbing", "boardgame"])("%s terrace lighting stays warm when entering at night", (template) => {
  const rig = setup();
  const { building, terrace } = getRoomLayout(template);
  const layout = { building, terrace };
  const atmosphere = { ...TEMPLATE_ATMOSPHERES[template], outdoorLight: { phase: "night", weather: "clear" } };
  const shader = { uniforms: {}, fragmentShader: "#include <lights_fragment_end>" };
  rig.update(atmosphere, rig.shell, true, template, layout);
  rig.bulb.material.onBeforeCompile(shader);
  const { terraceFill, terraceBounds, roomFill } = shader.uniforms;
  const preview = terraceFill.value.clone();
  const bounce = rig.scene.getObjectByName("room-bounce-light");
  const previewBounce = { position: bounce.position.clone(), intensity: bounce.intensity };
  expect(preview.r).toBeGreaterThan(preview.b);
  expect(terraceBounds.value.z).toBe(building.maxZ);
  expect(terraceBounds.value.w).toBe(terrace.maxZ);

  rig.update(atmosphere, rig.shell, false, template, { ...layout, generalLighting: false });
  expect(terraceFill.value).toEqual(preview);
  expect(bounce.position).toEqual(previewBounce.position);
  expect(bounce.intensity).toBe(previewBounce.intensity);
  expect(roomFill.value.r).toBe(0);
  rig.update({ ...atmosphere, lamps: 0 }, rig.shell, false, template, layout);
  expect(terraceFill.value.r).toBe(0);
  rig.update({ ...atmosphere, outdoorLight: { phase: "day", weather: "clear" } }, rig.shell, false, template, layout);
  expect(terraceFill.value.r).toBe(0);
  rig.dispose();
});

test("the daylight path moves with time and overcast weather softens direct light", () => {
  const rig = setup();
  const atmosphere = { ...DEFAULT_ATMOSPHERE, shadowSoftness: 0,
    outdoorLight: { phase: "dawn", weather: "clear", daylightProgress: 0 } };
  rig.update(atmosphere, rig.shell);
  const dawn = rig.sun.position.clone();
  rig.update({ ...atmosphere, outdoorLight: { phase: "day", weather: "clear", daylightProgress: 0.5 } }, rig.shell);
  const noon = { intensity: rig.sun.intensity, softness: rig.sun.shadow.radius, position: rig.sun.position.clone() };
  expect(noon.position.y).toBeGreaterThan(dawn.y);
  rig.update({ ...atmosphere, outdoorLight: { phase: "day", weather: "rain", daylightProgress: 0.5 } }, rig.shell);
  expect(rig.sun.intensity).toBeLessThan(noon.intensity);
  expect(rig.sun.shadow.radius).toBeGreaterThan(noon.softness);
  rig.update({ ...atmosphere, outdoorLight: { phase: "dusk", weather: "clear", daylightProgress: 1 } }, rig.shell);
  expect(rig.sun.position.y).toBeLessThan(noon.position.y);
  expect(rig.sun.position.distanceTo(dawn)).toBeGreaterThan(20);
  rig.update(DEFAULT_ATMOSPHERE, rig.shell);
  expect(rig.sun.position.y).toBe(24);
  expect(rig.sun.intensity).toBe(2.1);
  rig.dispose();
});

test.each(["climbing", "boardgame"])("%s daylight follows its glazed exposure instead of the opaque rear wall", (template) => {
  const rig = setup();
  const shell = createRoomShell({ template });
  try {
    for (const daylightProgress of [0, 0.5, 1]) {
      rig.update({ ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "day", weather: "clear", daylightProgress } }, shell);
      expect(Math.sign(rig.sun.position.z)).toBe(template === "climbing" ? -1 : 1);
    }
    rig.update({ ...DEFAULT_ATMOSPHERE, sunAngle: DEFAULT_ATMOSPHERE.sunAngle + 180,
      outdoorLight: { phase: "day", weather: "clear", daylightProgress: 0.5 } }, shell);
    expect(Math.sign(rig.sun.position.z)).toBe(template === "climbing" ? 1 : -1);
  } finally { disposeObject(shell); rig.dispose(); }
});

test.each(["lounge", "climbing", "boardgame", "dining", "band", "study", "photo"])("%s glazing follows the sky and restores its original material in custom mode", (template) => {
  const rig = setup();
  const shell = createRoomShell({ template });
  const windows = [];
  shell.traverse((object) => { if (object.userData.roomWindow) windows.push(object); });
  expect(windows.length).toBeGreaterThan(0);
  const originals = windows.map(({ material }) => ({ color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity }));
  try {
    rig.update({ ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "night", weather: "clear", daylightProgress: 0.5 } }, shell);
    expect(windows.every(({ material }) => material.color.b > material.color.r)).toBe(true);
    rig.update(DEFAULT_ATMOSPHERE, shell);
    windows.forEach(({ material }, index) => {
      expect(material.color).toEqual(originals[index].color);
      expect(material.emissive).toEqual(originals[index].emissive);
      expect(material.emissiveIntensity).toBe(originals[index].intensity);
    });
    expect(windows.filter((object) => object.name === "building-window-glass").every((object) => !object.castShadow)).toBe(true);
  } finally { disposeObject(shell); rig.dispose(); }
});

test("neon keeps its colored emission while lamp controls dim both the tube and its spill", () => {
  const rig = setup();
  rig.lamp.userData.roomLampColor = "#ff705b";
  rig.bulb.userData.roomBulbColor = "#ff705b";
  rig.bulb.userData.roomBulbStrength = 5.5;
  rig.update({ ...DEFAULT_ATMOSPHERE, warmth: 0, lamps: 50 }, rig.shell);
  expect(rig.lamp.color.getHexString()).toBe("ff705b");
  expect(rig.bulb.material.emissive.getHexString()).toBe("ff705b");
  expect(rig.bulb.material.emissiveIntensity).toBe(2.75);
  rig.update({ ...DEFAULT_ATMOSPHERE, lamps: 0 }, rig.shell);
  expect(rig.lamp.intensity).toBe(0);
  expect(rig.bulb.material.emissiveIntensity).toBe(0);
  rig.dispose();
});

test.each(["band", "photo"])("%s adds floor-facing diffuse bounce without changing existing light sources", (template) => {
  const rig = setup();
  const atmosphere = TEMPLATE_ATMOSPHERES[template];
  rig.update(atmosphere, rig.shell);
  const lights = rig.scene.children.map((light) => ({
    light, intensity: light.intensity, color: light.color.clone(), position: light.position.clone()
  }));
  const lampIntensity = rig.lamp.intensity;
  const bulbEmission = rig.bulb.material.emissiveIntensity;
  rig.update(atmosphere, rig.shell, false, template);
  const bounce = rig.scene.getObjectByName("room-diffuse-bounce");
  expect(rig.scene.children).toHaveLength(lights.length + (template === "band" ? 2 : 1));
  expect(bounce.isHemisphereLight).toBe(true);
  expect(bounce.position.toArray()).toEqual([0, -1, 0]);
  expect(bounce.castShadow).toBe(false);
  expect(bounce.color.r).toBeGreaterThan(bounce.color.b);
  expect(bounce.groundColor.r).toBeLessThan(bounce.color.r);
  expect(bounce.intensity).toBeGreaterThan(0);
  const acousticBounce = rig.scene.getObjectByName("room-band-acoustic-bounce");
  if (template === "band") {
    expect(acousticBounce.isLightProbe).toBe(true);
    expect(acousticBounce.intensity).toBeGreaterThan(0);
  } else expect(acousticBounce).toBeUndefined();
  for (const { light, intensity, color, position } of lights) {
    expect(light.intensity).toBe(intensity);
    expect(light.color).toEqual(color);
    expect(light.position).toEqual(position);
  }
  expect(rig.lamp.intensity).toBe(lampIntensity);
  expect(rig.bulb.material.emissiveIntensity).toBe(bulbEmission);
  rig.dispose();
});

test.each(["band", "photo"])("%s bounce follows ambient and lamp controls and fully extinguishes", (template) => {
  const rig = setup();
  const atmosphere = { ...DEFAULT_ATMOSPHERE, ambient: 0, sunlight: 0, lamps: 0 };
  rig.update(atmosphere, rig.shell, false, template);
  const bounce = rig.scene.getObjectByName("room-diffuse-bounce");
  const bounces = [bounce];
  if (template === "band") bounces.push(rig.scene.getObjectByName("room-band-acoustic-bounce"));
  expect(rig.scene.children.every((light) => light.intensity === 0)).toBe(true);
  expect(rig.lamp.intensity).toBe(0);
  expect(rig.bulb.material.emissiveIntensity).toBe(0);
  for (const control of ["ambient", "lamps"]) {
    rig.update({ ...atmosphere, [control]: 100 }, rig.shell, false, template);
    const full = bounces.map((light) => light.intensity);
    expect(full.every((intensity) => intensity > 0)).toBe(true);
    rig.update({ ...atmosphere, [control]: 50 }, rig.shell, false, template);
    bounces.forEach((light, index) => expect(light.intensity).toBeCloseTo(full[index] / 2));
  }
  rig.update(atmosphere, rig.shell, false, template);
  bounces.forEach((light) => expect(light.intensity).toBe(0));
  rig.dispose();
});

test("theme switches reuse bounce lights and keep the acoustic probe exclusive to band", () => {
  const rig = setup();
  const originalLights = [...rig.scene.children];
  rig.update(DEFAULT_ATMOSPHERE, rig.shell, false, "band");
  const bounce = rig.scene.getObjectByName("room-diffuse-bounce");
  const acousticBounce = rig.scene.getObjectByName("room-band-acoustic-bounce");
  rig.update(DEFAULT_ATMOSPHERE, rig.shell, false, "photo");
  expect(rig.scene.children).toEqual([...originalLights, bounce]);
  expect(acousticBounce.parent).toBeNull();
  expect(acousticBounce.intensity).toBe(0);
  for (const template of ["lounge", "climbing", "boardgame", "dining", "study", undefined]) {
    rig.update(DEFAULT_ATMOSPHERE, rig.shell, false, template);
    expect(rig.scene.children).toEqual(originalLights);
    expect(bounce.parent).toBeNull();
    expect(bounce.intensity).toBe(0);
    expect(acousticBounce.parent).toBeNull();
    expect(acousticBounce.intensity).toBe(0);
    rig.update(DEFAULT_ATMOSPHERE, rig.shell, false, "band");
    expect(rig.scene.children).toHaveLength(originalLights.length + 2);
    expect(rig.scene.children).toEqual(expect.arrayContaining([...originalLights, bounce, acousticBounce]));
  }
  rig.dispose();
});

test("band acoustic probe favors ceiling undersides and left walls over floor and right walls", () => {
  const rig = setup();
  rig.update(TEMPLATE_ATMOSPHERES.band, rig.shell, false, "band");
  const probe = rig.scene.getObjectByName("room-band-acoustic-bounce");
  expect(probe.isLightProbe).toBe(true);
  const irradiance = (normal) => probe.sh.getIrradianceAt(new THREE.Vector3(...normal), new THREE.Vector3())
    .multiplyScalar(probe.intensity);
  const targetFaces = [irradiance([0, -1, 0]), irradiance([1, 0, 0])];
  const otherFaces = [irradiance([0, 1, 0]), irradiance([-1, 0, 0])];
  for (const face of [...targetFaces, ...otherFaces]) {
    expect(face.toArray().every((channel) => Number.isFinite(channel) && channel >= -1e-8)).toBe(true);
  }
  for (const target of targetFaces) {
    expect(target.length()).toBeGreaterThan(0);
    for (const other of otherFaces) expect(target.length()).toBeGreaterThan(other.length() * 10);
  }
  rig.dispose();
});

test("yard spotlights aim from outside the building and get brighter after dark", () => {
  const scene = new THREE.Scene();
  const { building, terrace } = getRoomLayout("boardgame");
  const shell = createBuildingContext(building, "boardgame", terrace);
  const update = createRoomLighting(scene);
  scene.add(shell);

  const lights = shell.getObjectsByProperty("name", "yard-facade-spotlight");
  const { walkable } = getIslandLayout(building);
  expect(lights).toHaveLength(6);
  for (const light of lights) {
    expect(light.isSpotLight).toBe(true);
    expect(light.position.y).toBeLessThan(0.3);
    expect(light.target.position.y).toBeGreaterThan(2);
    expect(light.target.parent).toBe(shell);
  }
  const frontLights = lights.filter((light) => light.position.z > building.maxZ);
  expect(frontLights).toHaveLength(2);
  for (const light of frontLights) {
    expect(light.position.z).toBeGreaterThan(walkable.maxZ - 1);
    expect(light.target.position.z).toBeLessThan(light.position.z);
    const direction = light.target.position.clone().sub(light.position).normalize();
    expect(Math.asin(direction.y) - light.angle).toBeGreaterThanOrEqual(-0.036);
  }
  const leftLights = lights.filter((light) => light.position.x < walkable.minX + 1);
  const rightLights = lights.filter((light) => light.position.x > walkable.maxX - 1);
  expect(leftLights).toHaveLength(2);
  expect(rightLights).toHaveLength(2);
  expect(leftLights.every((light) => light.target.position.x > light.position.x)).toBe(true);
  expect(rightLights.every((light) => light.target.position.x < light.position.x)).toBe(true);

  update({ ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "day", weather: "clear" } }, scene, true);
  const dayStrength = lights.map((light) => light.intensity);
  update({ ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "night", weather: "clear" } }, scene, true);
  expect(lights.every((light, index) => light.intensity > dayStrength[index])).toBe(true);
  update({ ...DEFAULT_ATMOSPHERE, lamps: 0 }, scene, true);
  expect(lights.every((light) => light.intensity === 0)).toBe(true);
  disposeObject(scene);
});

test("point and spot lights skip shading outside their range or cone", () => {
  const rig = setup();
  const { building } = getRoomLayout("boardgame");
  rig.update(DEFAULT_ATMOSPHERE, rig.shell, false, "boardgame", { building });
  const shader = { uniforms: {}, fragmentShader: "#include <lights_fragment_begin>" };

  rig.bulb.material.onBeforeCompile(shader);

  const guard = "if (directLight.visible) { ";
  expect(shader.fragmentShader.split(guard)).toHaveLength(3);
  expect(shader.fragmentShader.replaceAll(guard, "").replaceAll("; }", ";"))
    .toContain(THREE.ShaderChunk.lights_fragment_begin);
  rig.dispose();
});

test.each([THREE.MeshPhysicalMaterial, THREE.MeshLambertMaterial])("%p avatars keep custom shaders and share the night light switch", (Material) => {
  const scene = new THREE.Scene();
  const update = createRoomLighting(scene);
  const { building } = getRoomLayout("boardgame");
  const night = { ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "night", weather: "clear" } };
  update(night, scene, false, "boardgame", { building });

  const material = new Material();
  const prepareAvatar = jest.fn((shader) => { shader.vertexShader += "\n// avatar deformation"; });
  material.onBeforeCompile = prepareAvatar;
  material.customProgramCacheKey = () => "avatar-variant";
  // Avatar materials can appear after the room has already been lit.
  update.applyMaterial(material);
  update.applyMaterial(material);
  const base = THREE.ShaderLib[material.isMeshLambertMaterial ? "lambert" : "physical"];
  const shader = { ...base, uniforms: {} };
  material.onBeforeCompile(shader);
  expect(prepareAvatar).toHaveBeenCalledTimes(1);
  expect(material.customProgramCacheKey()).toContain("avatar-variant");
  expect(shader.vertexShader).toContain("// avatar deformation");
  expect(shader.fragmentShader).toContain("all(greaterThanEqual(roomPosition, roomMin))");
  expect(shader.uniforms.roomMin.value.x).toBe(building.minX);
  expect(shader.uniforms.roomFill.value.r).toBeGreaterThan(0);
  update(night, scene, false, "boardgame", { building, generalLighting: false });
  expect(shader.uniforms.roomFill.value.r).toBe(0);
  material.dispose();
  disposeObject(scene);
});

test("the wall switch controls the general lighting and leaves the spotlights and moonlight alone", () => {
  const scene = new THREE.Scene();
  const layout = getRoomLayout("boardgame");
  const ceiling = createRoomCeilingLighting(layout);
  scene.add(ceiling, createBuildingContext(layout.building, "boardgame", layout.terrace));
  const update = createRoomLighting(scene);
  const day = { ...DEFAULT_ATMOSPHERE, outdoorLight: { phase: "day", weather: "clear" } };
  const night = { ...day, outdoorLight: { phase: "night", weather: "clear" } };
  const bulbs = [];
  ceiling.traverse((object) => { if (object.userData.roomGeneralBulb) bulbs.push(object); });
  const otherLights = [scene.getObjectByName("yard-facade-spotlight"), scene.getObjectByName("room-sun-moonlight")];
  const lighting = { building: layout.building };
  const shader = { uniforms: {}, fragmentShader: "#include <lights_fragment_end>" };

  update(day, scene, false, "boardgame", lighting);
  bulbs[0].material.onBeforeCompile(shader);
  const daytimeFill = shader.uniforms.roomFill.value.r;
  expect(shader.uniforms.roomMin.value.z).toBe(layout.building.minZ);
  expect(shader.uniforms.roomMax.value.z).toBe(layout.building.maxZ);
  ceiling.children.forEach((fixture) => { fixture.visible = false; });
  update(night, scene, false, "boardgame", lighting);
  expect(bulbs.every((bulb) => bulb.material.emissiveIntensity > 0)).toBe(true);
  expect(shader.uniforms.roomFill.value.r).toBeGreaterThan(daytimeFill);
  const previous = otherLights.map((light) => light.intensity);
  update(night, scene, false, "boardgame", { ...lighting, generalLighting: false });
  expect(bulbs.every((bulb) => bulb.material.emissiveIntensity === 0)).toBe(true);
  expect(shader.uniforms.roomFill.value.r).toBe(0);
  expect(otherLights.map((light) => light.intensity)).toEqual(previous);
  update(night, scene, false, "boardgame", lighting);
  expect(shader.uniforms.roomFill.value.r).toBeGreaterThan(daytimeFill);
  expect(bulbs.every((bulb) => bulb.material.emissiveIntensity > 0)).toBe(true);
  disposeObject(scene);
});
