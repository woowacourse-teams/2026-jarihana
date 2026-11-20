import * as THREE from "three";

const SEA_LEVEL = -36;
const PALETTES = {
  day: { sea: "#477e94", shallows: "#79adae", land: "#6c8063", rock: "#84918a", haze: "#b4cbd9", glint: "#e2efdc" },
  dawn: { sea: "#686d8b", shallows: "#a2a0a6", land: "#727366", rock: "#958592", haze: "#c7a4ad", glint: "#f4c9a1" },
  dusk: { sea: "#666c84", shallows: "#ab9590", land: "#69685d", rock: "#927a89", haze: "#c7a0a4", glint: "#ffd2a2" },
  night: { sea: "#243e59", shallows: "#3e6174", land: "#344b4a", rock: "#4b6074", haze: "#63758e", glint: "#b2cce7" }
};

function riverCenter(z) {
  return Math.sin(z * 0.017) * 36 + Math.sin(z * 0.007 + 1.2) * 23;
}

function terrainHeight(x, z) {
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(x, z);
  const coast = THREE.MathUtils.smoothstep(110 - z + Math.sin(x * 0.012) * 42, 0, 95);
  const mountain = THREE.MathUtils.smoothstep(radius, 105, 220) * (1 - THREE.MathUtils.smoothstep(radius, 365, 520));
  const ridge = 48 + Math.sin(angle * 5 + 1) * 19 + Math.sin(angle * 11 + radius * 0.016) * 14;
  const hills = 7 + Math.sin(x * 0.021 + z * 0.009) * 4 + Math.sin(z * 0.025 - x * 0.013) * 3;
  let height = SEA_LEVEL - 5 + coast * (10 + hills + mountain * ridge);
  // The river cuts through the valley into the open bay in front of the island.
  const riverWidth = 10 + THREE.MathUtils.smoothstep(z, -400, 110) * 11;
  const bank = THREE.MathUtils.smoothstep(Math.abs(x - riverCenter(z)), riverWidth, riverWidth + 13);
  if (z > -410 && z < 160) height = THREE.MathUtils.lerp(SEA_LEVEL - 1.4, height, bank);
  return height;
}

function terrainGeometry() {
  const geometry = new THREE.PlaneGeometry(1040, 1040, 160, 160);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i += 1) {
    positions.setY(i, terrainHeight(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function ridgeGeometry(radius, height, seed) {
  const positions = [];
  const segments = 192;
  const ridgePoint = (index, top) => {
    const angle = index / segments * Math.PI * 2;
    const coastalOpening = 1 - Math.max(0, Math.cos(angle)) ** 5 * 0.84;
    const profile = 0.8 + Math.sin(angle * 5 + seed) * 0.2 + Math.sin(angle * 13 - seed) * 0.12 + Math.sin(angle * 29 + seed) * 0.045;
    const distance = radius + Math.sin(angle * 7 + seed) * 18;
    return [Math.sin(angle) * distance, top ? SEA_LEVEL + height * profile * coastalOpening : SEA_LEVEL - 14, Math.cos(angle) * distance];
  };
  for (let index = 0; index < segments; index += 1) {
    const a = ridgePoint(index, false), b = ridgePoint(index + 1, false);
    const c = ridgePoint(index, true), d = ridgePoint(index + 1, true);
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function seaGeometry() {
  const segments = 128;
  const radii = [0, 100, 250, 450, 700, 900, 1060];
  const positions = [];
  const indices = [];
  for (const radius of radii) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      positions.push(Math.sin(angle) * radius, SEA_LEVEL, Math.cos(angle) * radius);
    }
  }
  for (let ring = 0; ring < radii.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const a = ring * (segments + 1) + index;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function colorGeometry(geometry, colorAt) {
  const positions = geometry.getAttribute("position");
  const colors = geometry.getAttribute("color") || new THREE.Float32BufferAttribute(new Float32Array(positions.count * 4), 4);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const alpha = colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.setXYZW(index, color.r, color.g, color.b, alpha);
  }
  geometry.setAttribute("color", colors);
  colors.needsUpdate = true;
}

export function createIslandHorizon() {
  const group = new THREE.Group();
  group.name = "island-horizon";
  group.visible = false;
  const edgeFade = { value: 0 };
  function blendWithPage(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.horizonEdgeFade = edgeFade;
      shader.vertexShader = `varying vec4 horizonClip;\n${shader.vertexShader}`.replace(
        "#include <project_vertex>", "#include <project_vertex>\nhorizonClip = gl_Position;"
      );
      shader.fragmentShader = `varying vec4 horizonClip; uniform float horizonEdgeFade;\n${shader.fragmentShader}`.replace(
        "#include <alphatest_fragment>",
        `vec2 horizonScreen = horizonClip.xy / horizonClip.w;
        float horizonFade = max(smoothstep(0.73, 0.995, abs(horizonScreen.x)), smoothstep(0.60, 0.995, -horizonScreen.y));
        diffuseColor.a *= 1.0 - horizonFade * horizonEdgeFade;
        #include <alphatest_fragment>`
      );
    };
  }
  const addLandscape = (name, geometry, renderOrder) => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    blendWithPage(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.renderOrder = renderOrder;
    mesh.raycast = () => {};
    group.add(mesh);
    return mesh;
  };
  const ocean = addLandscape("horizon-sea-and-river", seaGeometry(), -5);
  const farRidge = addLandscape("horizon-far-mountains", ridgeGeometry(820, 116, 0.8), -4);
  const nearRidge = addLandscape("horizon-middle-mountains", ridgeGeometry(585, 94, 2.4), -3);
  const terrain = addLandscape("horizon-river-valley", terrainGeometry(), -2);
  const glintMaterial = new THREE.MeshBasicMaterial({ color: "#e2efdc", transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false });
  blendWithPage(glintMaterial);
  const glints = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glintMaterial, 114);
  glints.name = "horizon-water-highlights";
  glints.renderOrder = -1;
  glints.raycast = () => {};
  const transform = new THREE.Object3D();
  for (let index = 0; index < glints.count; index += 1) {
    const river = index >= 76;
    const z = river ? -360 + (index - 76) * 12 : 135 + index * 7;
    const x = river ? riverCenter(z) + Math.sin(index * 7.71) * 7 : Math.sin(index * 7.71) * (45 + index * 2.6) + 75;
    transform.position.set(x, SEA_LEVEL + 0.04, z);
    transform.rotation.set(-Math.PI / 2, 0, Math.sin(index) * 0.07);
    transform.scale.set((river ? 0.42 : 1) * (5 + (index % 7) * 2.3), 0.3 + (index % 3) * 0.18, 1);
    transform.updateMatrix();
    glints.setMatrixAt(index, transform.matrix);
  }
  glints.instanceMatrix.needsUpdate = true;
  group.add(glints);
  let lastPalette;

  function update(outdoors) {
    const phase = outdoors?.phase || "day";
    const weather = outdoors?.weather || "clear";
    const key = `${phase}:${weather}`;
    if (key === lastPalette) return;
    lastPalette = key;
    const palette = PALETTES[phase] || PALETTES.day;
    const sea = new THREE.Color(palette.sea);
    const shallows = new THREE.Color(palette.shallows);
    const land = new THREE.Color(palette.land);
    const rock = new THREE.Color(palette.rock);
    const haze = new THREE.Color(palette.haze);
    const overcast = weather !== "clear";
    if (overcast) {
      const grey = new THREE.Color(phase === "night" ? "#536078" : "#a9bbc7");
      for (const color of [sea, shallows, land, rock, haze]) color.lerp(grey, weather === "rain" ? 0.35 : 0.22);
    }
    if (weather === "snow") {
      land.lerp(haze, 0.53);
      rock.lerp(haze, 0.7);
    }
    colorGeometry(ocean.geometry, (color, x, y, z) => {
      const radius = Math.hypot(x, z);
      const coastal = 1 - THREE.MathUtils.smoothstep(radius, 100, 380);
      color.copy(sea).lerp(shallows, coastal * 0.65).lerp(haze, THREE.MathUtils.smoothstep(radius, 400, 1000) * 0.65);
      return 1 - THREE.MathUtils.smoothstep(radius, 850, 1060);
    });
    for (const [mesh, hazeAmount] of [[nearRidge, 0.48], [farRidge, 0.75]]) {
      colorGeometry(mesh.geometry, (color, x, y, z) => {
        const relief = (Math.sin(Math.atan2(x, z) * 11) + 1) * 0.035;
        color.copy(rock).lerp(haze, hazeAmount + relief + THREE.MathUtils.smoothstep(y, -35, 75) * 0.08);
        return 1;
      });
    }
    colorGeometry(terrain.geometry, (color, x, y, z) => {
      const radius = Math.hypot(x, z);
      const relief = (terrainHeight(x + 3, z) - terrainHeight(x - 3, z)) * 0.009;
      color.copy(land).lerp(rock, THREE.MathUtils.smoothstep(y, -12, 52));
      color.multiplyScalar(THREE.MathUtils.clamp(0.96 + relief, 0.8, 1.12));
      color.lerp(haze, THREE.MathUtils.smoothstep(radius, 90, 550) * (overcast ? 0.67 : 0.42));
      return (1 - THREE.MathUtils.smoothstep(radius, 460, 520)) * THREE.MathUtils.smoothstep(y, SEA_LEVEL - 0.2, SEA_LEVEL + 2.5);
    });
    glintMaterial.color.set(palette.glint);
    glintMaterial.opacity = overcast ? 0.07 : phase === "night" ? 0.19 : 0.25;
  }

  update();
  return {
    group,
    update,
    setEdgeFade(enabled) { edgeFade.value = Number(enabled); },
    dispose() {
      for (const mesh of group.children) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      glints.dispose();
      group.removeFromParent();
      group.clear();
    }
  };
}
