import * as THREE from "three";
import { getDioramaBounds } from "./islandLayout";
import { DEFAULT_ATMOSPHERE } from "./roomState";

const directLighting = THREE.ShaderChunk.lights_fragment_begin.replace(
  /(get(?:Point|Spot)LightInfo\([^;]+;[\s\S]*?)(RE_Direct\([^;]+;)/g,
  // Three already computes whether these lights reach the fragment. Skip the BRDF when their contribution is zero.
  "$1if (directLight.visible) { $2 }"
);

function createBandAcousticBounce() {
  const direction = new THREE.Vector3(1, -1, 0).normalize();
  const basis = [];
  THREE.SphericalHarmonics3.getBasisAt(direction, basis);
  const tint = new THREE.Color(0xe7ddda);
  const sh = new THREE.SphericalHarmonics3();
  // Shape the probe's diffuse irradiance as ((1 + normal · direction) / 2)².
  const weights = [4 / 3, 1, 1, 1, 8 / 15, 8 / 15, 8 / 15, 8 / 15, 8 / 15];
  sh.coefficients.forEach((coefficient, index) => {
    coefficient.set(tint.r, tint.g, tint.b).multiplyScalar(basis[index] * weights[index]);
  });
  const probe = new THREE.LightProbe(sh, 0);
  probe.name = "room-band-acoustic-bounce";
  return probe;
}

export function createRoomLighting(scene) {
  const ambient = new THREE.HemisphereLight(0xfff4e2, 0xb69b83, 1.65);
  ambient.name = "room-skylight";
  const sun = new THREE.DirectionalLight(0xffe1b4, 2.1);
  sun.name = "room-sun-moonlight";
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 0.1, far: 80 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  const fill = new THREE.DirectionalLight(0xfff3e4, 0.85);
  fill.name = "room-bounce-light";
  fill.position.set(8, 7, -4);
  scene.add(ambient, sun, fill);

  const bounce = new THREE.HemisphereLight(0xffd4a0, 0x8b7466, 0);
  bounce.name = "room-diffuse-bounce";
  // The lower hemisphere lifts undersides and walls through diffuse irradiance only.
  bounce.position.set(0, -1, 0);
  const bandAcousticBounce = createBandAcousticBounce();

  const cool = new THREE.Color("#e8efff");
  const warm = new THREE.Color("#ffd39a");
  const coolGround = new THREE.Color("#8796b4");
  const warmGround = new THREE.Color("#c1a080");
  const lampColor = new THREE.Color();
  const windowColor = new THREE.Color();
  const windowMaterials = new WeakMap();
  const fillMaterials = new WeakSet();
  const roomFill = { value: new THREE.Color() };
  const roomMin = { value: new THREE.Vector3() };
  const roomMax = { value: new THREE.Vector3() };
  const warmWhite = new THREE.Color("#fff1de");
  const terraceFill = { value: new THREE.Color(0) };
  const terraceBounds = { value: new THREE.Vector4() };
  const landscapeFill = { value: new THREE.Color() };
  const noLandscapeFill = { value: new THREE.Color(0) };

  function addDiffuseFill(shader, material) {
    Object.assign(shader.uniforms, { roomFill, roomMin, roomMax, terraceFill, terraceBounds,
      islandFill: material.userData.islandLandscape ? landscapeFill : noLandscapeFill });
    shader.fragmentShader = `uniform vec3 roomFill, roomMin, roomMax, terraceFill, islandFill;
uniform vec4 terraceBounds;\n${shader.fragmentShader}`
      .replace("#include <lights_fragment_begin>", directLighting)
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse += islandFill * BRDF_Lambert(material.diffuseColor);
        if (roomFill.r > 0.0 || terraceFill.r > 0.0) {
          vec3 roomPosition = cameraPosition - vViewPosition * mat3(viewMatrix);
          if (all(greaterThanEqual(roomPosition, roomMin)) && all(lessThanEqual(roomPosition, roomMax))) {
            reflectedLight.indirectDiffuse += roomFill * BRDF_Lambert(material.diffuseColor);
          }
          if (terraceFill.r > 0.0 && roomPosition.z >= terraceBounds.z - 0.4 &&
              roomPosition.z <= terraceBounds.w + 1.0 && roomPosition.y < 4.0) {
            float width = smoothstep(terraceBounds.x, terraceBounds.x + 1.2, roomPosition.x) *
              (1.0 - smoothstep(terraceBounds.y - 1.2, terraceBounds.y, roomPosition.x));
            float depth = smoothstep(terraceBounds.z - 0.4, terraceBounds.z, roomPosition.z) *
              (1.0 - smoothstep(terraceBounds.w, terraceBounds.w + 1.0, roomPosition.z));
            float height = 1.0 - smoothstep(2.6, 4.0, roomPosition.y);
            vec3 lightDirection = mat3(viewMatrix) * vec3(0.0, 0.38, 0.925);
            float facing = 0.24 + 0.76 * max(dot(normal, lightDirection), 0.0);
            reflectedLight.indirectDiffuse += terraceFill * (width * depth * height * facing) *
              BRDF_Lambert(material.diffuseColor);
          }
        }`
      );
  }

  function applyMaterial(material) {
    if (!(material?.isMeshStandardMaterial || material?.isMeshLambertMaterial) || fillMaterials.has(material)) return;
    const prepare = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      prepare.call(material, shader, renderer);
      addDiffuseFill(shader, material);
    };
    material.customProgramCacheKey = () => `${cacheKey}|room-diffuse-fill`;
    material.needsUpdate = true;
    fillMaterials.add(material);
  }

  function update(atmosphere = DEFAULT_ATMOSPHERE, shell, front = false, template, { generalLighting = true, building, terrace } = {}) {
    const band = template === "band";
    if (band || template === "photo") {
      // The band's dark finishes need a stronger floor and wall wash.
      bounce.groundColor.setHex(band ? 0xae9b90 : 0x8b7466);
      bounce.intensity = (0.45 * atmosphere.ambient + 0.3 * atmosphere.lamps) / 100 * (band ? 1.3 : 1);
      if (!bounce.parent) scene.add(bounce);
    } else {
      bounce.intensity = 0;
      bounce.removeFromParent();
    }
    if (band) {
      bandAcousticBounce.intensity = bounce.intensity * 3.2;
      if (!bandAcousticBounce.parent) scene.add(bandAcousticBounce);
    } else {
      bandAcousticBounce.intensity = 0;
      bandAcousticBounce.removeFromParent();
    }
    const warmth = atmosphere.warmth / 100;
    ambient.color.copy(cool).lerp(warm, warmth * 0.4);
    ambient.groundColor.copy(coolGround).lerp(warmGround, warmth);
    ambient.intensity = 1.65 * atmosphere.ambient / 100;
    fill.color.copy(cool).lerp(warm, warmth * (front ? 0.7 : 0.4));
    fill.position.set(front ? 0 : 8, front ? 5 : 7, front ? 20 : -4);
    fill.intensity = (front ? 1.25 : 0.85) * atmosphere.ambient / 100;
    sun.color.copy(cool).lerp(warm, warmth);
    sun.intensity = 2.1 * atmosphere.sunlight / 100;
    const angle = THREE.MathUtils.degToRad(atmosphere.sunAngle);
    sun.position.set(Math.sin(angle) * 12, 24, Math.cos(angle) * 12);
    sun.shadow.radius = 1 + atmosphere.shadowSoftness / 15;
    lampColor.copy(cool).lerp(warm, warmth);
    let lampStrength = atmosphere.lamps / 100;
    let bulbStrength = 0.75 * lampStrength;
    let generalStrength = 0.8;
    const outdoors = atmosphere.outdoorLight;
    terraceFill.value.setHex(0);
    if (outdoors) {
      const night = outdoors.phase === "night";
      const twilight = outdoors.phase === "dawn" || outdoors.phase === "dusk";
      const overcast = outdoors.weather !== "clear";
      const transmission = { clear: 1, cloudy: 0.4, rain: 0.18, snow: 0.5 }[outdoors.weather] ?? 1;
      const progress = Number.isFinite(outdoors.daylightProgress) ? THREE.MathUtils.clamp(outdoors.daylightProgress, 0, 1) : 0.5;
      const elevation = night ? 0.55 : 0.12 + Math.sin(progress * Math.PI) * 0.9;
      // Start from the main glazed exposure; the saved angle can rotate that daylight path.
      const exposure = (shell?.getObjectByName("climbing-industrial-window") || shell?.getObjectByName("climbing-daylight-window")) ? Math.PI : 0;
      const azimuth = exposure + angle - THREE.MathUtils.degToRad(DEFAULT_ATMOSPHERE.sunAngle) + (progress - 0.5) * Math.PI * 0.65;
      sun.position.set(Math.sin(azimuth) * 28, 4 + elevation * 24, Math.cos(azimuth) * 28);
      sun.color.set(night ? "#a9c4ff" : twilight ? "#ffc18b" : "#fff1d5");
      sun.intensity *= (night ? 0.18 : twilight ? 0.65 : 1.1) * transmission;
      sun.shadow.radius = Math.max(sun.shadow.radius, overcast ? 6 : 2);
      ambient.color.set(night ? "#899bc5" : twilight ? "#d9a5a0" : overcast ? "#b9c9d4" : "#d1e5ff");
      ambient.groundColor.set(night ? "#4b4c64" : twilight ? "#9b756b" : "#a6aa91");
      ambient.intensity *= night ? 0.42 : twilight ? 0.72 : overcast ? 0.88 : 1;
      fill.color.set(night ? "#8a9ec7" : twilight ? "#eed3bb" : "#e6edfa");
      if (night) {
        fill.position.set(8, 7, -4);
        fill.intensity = 0.85 * 0.32 * atmosphere.ambient / 100;
      } else fill.intensity *= twilight ? 0.65 : 0.85;
      lampColor.lerp(warm, 0.55);
      lampStrength *= night ? 1.45 : twilight ? 1.15 : overcast ? 0.8 : 0.4;
      bulbStrength = (night ? 1.25 : 0.85) * lampStrength;
      generalStrength = night ? 1 : twilight ? 0.8 : overcast ? 0.67 : 0.4;
      windowColor.set(night ? "#566b9c" : twilight ? "#e7b497" : overcast ? "#a3b8c6" : "#b4d8ec");
    }
    // Keep the shadow shader variant stable, but stop redrawing its map while disabled.
    const shadows = Boolean(atmosphere.shadows && sun.intensity > 0);
    sun.shadow.intensity = shadows ? 1 : 0;
    sun.shadow.autoUpdate = shadows;
    sun.shadow.needsUpdate = shadows || sun.shadow.map === null;
    if (building) {
      roomMin.value.set(building.minX, -0.025, building.minZ);
      roomMax.value.set(building.maxX, building.height + 0.025, building.maxZ);
      roomFill.value.copy(warmWhite).multiplyScalar(generalLighting ? generalStrength * 3.35 : 0);
      if (outdoors?.phase === "night") {
        // Keep warm light on the facade and greeters through camera changes without lighting the whole lawn.
        const bounds = getDioramaBounds({ building, terrace });
        terraceBounds.value.set(bounds.minX, bounds.maxX, building.maxZ, bounds.maxZ);
        terraceFill.value.set("#dfc9ae").multiplyScalar(0.68 * lampStrength);
      }
    }
    landscapeFill.value.set("#c1d4ff").multiplyScalar(
      outdoors?.phase === "night" ? 0.85 : outdoors?.phase === "dawn" || outdoors?.phase === "dusk" ? 0.28 : 0
    );
    shell?.traverse((object) => {
      if (building && object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material.aoMap?.userData.roomBakedOcclusion) material.aoMapIntensity = atmosphere.shadows ? 0.8 : 0;
          if (material.isMeshStandardMaterial) applyMaterial(material);
        }
      }
      if (object.userData.roomLamp) {
        object.color.copy(object.userData.roomLampColor ? new THREE.Color(object.userData.roomLampColor) : lampColor);
        object.intensity = (object.userData.roomLampStrength || 5) * lampStrength;
      }
      if (object.userData.roomBulb) {
        object.material.emissive.copy(object.userData.roomBulbColor ? new THREE.Color(object.userData.roomBulbColor) : lampColor);
        object.material.emissiveIntensity = bulbStrength * (object.userData.roomBulbStrength ?? 0.75) / 0.75;
      }
      if (object.userData.roomGeneralBulb) {
        object.material.emissive.copy(lampColor);
        object.material.emissiveIntensity = generalLighting ? 0.75 : 0;
      }
      if (object.userData.roomWindow) {
        const material = object.material;
        if (!windowMaterials.has(material)) windowMaterials.set(material, {
          color: material.color.clone(), emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity
        });
        const original = windowMaterials.get(material);
        material.color.copy(outdoors ? windowColor : original.color);
        material.emissive.copy(outdoors ? windowColor : original.emissive);
        material.emissiveIntensity = outdoors ? (outdoors.phase === "night" ? 0.06 : 0.24) * atmosphere.ambient / 100 : original.emissiveIntensity;
      }
    });
  }

  update.applyMaterial = applyMaterial;
  return update;
}
