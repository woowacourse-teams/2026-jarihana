import { createLibraryCovers } from "./libraryCovers";
import { createWoodGrain, createSurfaceMaterial } from "./architecturalMaterials";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOARDGAME } from "./roomLayout";

const WOOD = "#a66c3d";
const DARK_WOOD = "#493227";
const METAL = "#3c3432";
const BOX_COLORS = ["#d3aa55", "#476579", "#8b493b", "#526e52", "#e2caa0", "#735b7d", "#b37343", "#344a58"];

function woodTexture() { return createWoodGrain(); }

function clothTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const weave = (x % 4 < 2 ? 8 : -8) + (y % 4 < 2 ? 5 : -5);
    const value = 227 + weave + ((x * 17 + y * 31) % 7);
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function kit(name) {
  const group = new THREE.Group();
  group.name = name;
  const materials = new Map();
  let grain;
  let cloth;
  function material(color, finish = false) {
    const wooden = finish === true;
    const fabric = finish === "fabric";
    const key = `${color?.isColor ? color.getHexString() : color}:${finish}`;
    if (!materials.has(key)) {
      if (wooden && !grain) grain = woodTexture();
      if (fabric && !cloth) cloth = clothTexture();
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: fabric ? 0.98 : wooden ? 0.76 : 0.83,
        map: fabric ? cloth : wooden ? grain : null, bumpMap: fabric ? cloth : null, bumpScale: fabric ? 0.002 : 0 }));
    }
    return materials.get(key);
  }
  function mesh(geometry, color, x = 0, y = 0, z = 0, wooden = false) {
    const item = new THREE.Mesh(geometry, material(color, wooden));
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  }
  function box(w, h, d, color, x = 0, y = 0, z = 0, rounded = 0, wooden = false) {
    return mesh(rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(rounded, w / 2, h / 2, d / 2)) :
      new THREE.BoxGeometry(w, h, d), color, x, y, z, wooden);
  }
  function cylinder(r1, r2, height, color, x, y, z) {
    return mesh(new THREE.CylinderGeometry(r1, r2, height, 16), color, x, y, z);
  }
  return { group, material, mesh, box, cylinder };
}

function beam(target, from, to, thickness, color = METAL) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const difference = b.clone().sub(a);
  const item = target.mesh(new THREE.BoxGeometry(thickness, difference.length(), thickness), color,
    ...a.clone().add(b).multiplyScalar(0.5).toArray());
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), difference.normalize());
  return item;
}

function surface(target, width, height, depth, color, x, y, z, kind) {
  const item = target.box(width, height, depth, color, x, y, z, 0, kind === "floor");
  item.userData.roomSurface = kind;
  item.userData.surfaceShade = 1;
  return item;
}

function planks(target, area, floorHeight, color) {
  const width = area.maxX - area.minX, depth = area.maxZ - area.minZ;
  const floor = surface(target, width, 0.22, depth, color, (area.minX + area.maxX) / 2,
    floorHeight - 0.11, (area.minZ + area.maxZ) / 2, "floor");
  floor.material = createSurfaceMaterial("walnut", color, width, depth);
  floor.name = "walnut-floorboards";
}

function gameBoxes(target, width, height, depth, salt = 0, base = 0.18) {
  const count = 4 * 7;
  const coverBoxes = [];
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), target.material("#ffffff"), count);
  const labels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), target.material("#efe3bf"), count);
  const badges = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.01, 6), target.material("#e7ce8d"), count);
  boxes.name = "boardgame-boxes";
  labels.name = "game-box-titles";
  badges.name = "game-box-emblems";
  boxes.castShadow = true;
  boxes.receiveShadow = true;
  const pose = new THREE.Object3D();
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const index = row * 7 + col;
      const boxWidth = width / 7 - 0.045;
      const flat = (index + salt) % 6 === 0;
      const boxHeight = height / 4 * (flat ? 0.28 : 0.55 + ((index + salt) % 3) * 0.1);
      const x = -width / 2 + (col + 0.5) * width / 7;
      const y = base + row * height / 4 + boxHeight / 2;
      const z = 0.04;
      coverBoxes.push({ x, y, width: boxWidth, height: boxHeight, angle: index % 9 === 0 ? -0.045 : 0 });
      pose.position.set(x, y, z);
      pose.rotation.set(0, 0, index % 9 === 0 ? -0.045 : 0);
      pose.scale.set(boxWidth, boxHeight, depth * 0.72);
      pose.updateMatrix(); boxes.setMatrixAt(index, pose.matrix);
      boxes.setColorAt(index, new THREE.Color(BOX_COLORS[(index * 3 + row + salt) % BOX_COLORS.length]));
      pose.position.set(x, y + boxHeight * 0.24, z + depth * 0.37);
      pose.rotation.set(0, 0, 0);
      pose.scale.set(boxWidth * 0.65, 0.027 + (index % 2) * 0.015, 0.01);
      pose.updateMatrix(); labels.setMatrixAt(index, pose.matrix);
      pose.position.set(x, y - boxHeight * 0.12, z + depth * 0.38);
      pose.rotation.x = Math.PI / 2;
      pose.scale.set(boxWidth * 0.23, 1, boxWidth * 0.23);
      pose.updateMatrix(); badges.setMatrixAt(index, pose.matrix);
      badges.setColorAt(index, new THREE.Color(BOX_COLORS[(index + salt + 2) % BOX_COLORS.length]).lerp(new THREE.Color("#fff0bf"), 0.5));
    }
  }
  const covers = createLibraryCovers(coverBoxes, depth, salt);
  target.group.add(boxes);
  if (covers) {
    target.group.add(covers); labels.geometry.dispose(); badges.geometry.dispose();
  } else target.group.add(labels, badges);
}

function shelf(width = 2.4, depth = 0.55, height = 2.7, salt = 0, style = "wood") {
  const item = kit("boardgame-library-shelf");
  item.group.userData.libraryStyle = style;
  const timber = style === "black" ? "#303238" : style === "display" ? "#514039" : WOOD;
  const backing = style === "wood" ? DARK_WOOD : "#27292c";
  const base = 0.52;
  const storageHeight = height - base - 0.14;
  item.box(width, height, 0.06, backing, 0, height / 2, -depth / 2 + 0.03, 0, true);
  for (const x of [-width / 2 + 0.045, width / 2 - 0.045]) item.box(0.09, height, depth, timber, x, height / 2, 0, 0.008, true);
  for (let row = 0; row <= 4; row += 1) item.box(width, 0.06, depth, timber, 0, base + row * storageHeight / 4, 0, 0.006, true);
  for (const x of [-width / 6, width / 6]) item.box(0.035, storageHeight, depth - 0.03, timber, x, base + storageHeight / 2, 0, 0, true);
  gameBoxes(item, width - 0.22, storageHeight, depth, salt, base + 0.045);
  item.box(width + 0.02, 0.13, depth + 0.02, timber, 0, 0.065, 0, 0.008, true);
  for (const x of [-width / 4, width / 4]) {
    item.box(width / 2 - 0.08, 0.32, depth - 0.04, timber, x, 0.29, 0.02, 0.014, true);
    item.box(0.26, 0.025, 0.025, "#b99a65", x, 0.36, depth / 2 + 0.004, 0.006);
  }
  item.box(width + 0.02, 0.1, depth + 0.04, style === "wood" ? "#c18b4d" : timber, 0, height - 0.05, 0, 0.01, true);
  return item.group;
}

function warmBulb(target, x, y, z, strength = 10, reach = 9, size = 0.09) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshStandardMaterial({
    color: "#ffdf99", emissive: "#ffb954", emissiveIntensity: 1.5, roughness: 0.35
  }));
  bulb.position.set(x, y, z);
  bulb.userData.roomBulb = true;
  target.group.add(bulb);
  const light = new THREE.PointLight("#ffc779", strength, reach, 1.6);
  light.position.set(x, y - 0.04, z);
  light.userData.roomLamp = true;
  light.userData.roomLampStrength = strength;
  target.group.add(light);
}

function pendant(parent, x, z, y, ceilingY, { mezzanine = false, shade = true } = {}) {
  const lamp = kit("boardgame-pendant");
  lamp.group.userData.mezzanine = mezzanine;
  lamp.cylinder(0.012, 0.012, ceilingY - y, METAL, x, (ceilingY + y) / 2, z);
  if (shade) lamp.cylinder(0.12, 0.32, 0.23, "#5c4632", x, y + 0.15, z);
  else lamp.cylinder(0.045, 0.045, 0.09, METAL, x, y + 0.08, z);
  warmBulb(lamp, x, y, z, mezzanine ? 10 : 13, 10, shade ? 0.1 : 0.08);
  parent.group.add(lamp.group);
}

function plant(parent, x, y, z, scale = 1) {
  const pot = kit("library-plant");
  pot.cylinder(0.18, 0.13, 0.28, "#ba7845", 0, 0.14, 0);
  pot.cylinder(0.012, 0.018, 0.5, "#5c6b38", 0, 0.5, 0);
  for (let i = 0; i < 8; i += 1) {
    const angle = i * 2.4;
    const leaf = pot.mesh(new THREE.SphereGeometry(1, 10, 6), i % 2 ? "#7b9346" : "#546f3e",
      Math.cos(angle) * 0.13, 0.42 + i * 0.052, Math.sin(angle) * 0.13);
    leaf.scale.set(0.07, 0.19, 0.035);
    leaf.rotation.set(Math.cos(angle) * 0.55, angle, Math.sin(angle) * 0.55);
  }
  pot.group.position.set(x, y, z);
  pot.group.scale.setScalar(scale);
  parent.group.add(pot.group);
}

function rail(target, entry, base) {
  const alongX = entry.width > entry.depth;
  const length = alongX ? entry.width : entry.depth;
  const point = (offset, y) => [entry.x + (alongX ? offset : 0), y, entry.z + (alongX ? 0 : offset)];
  for (const y of [base + 0.12, base + 1.02]) beam(target, point(-length / 2, y), point(length / 2, y), 0.055);
  const posts = Math.ceil(length / 0.78);
  for (let i = 0; i <= posts; i += 1) {
    const offset = -length / 2 + length * i / posts;
    beam(target, point(offset, base), point(offset, base + 1.06), 0.045);
  }
  beam(target, point(-length / 2, base + 1.07), point(length / 2, base + 1.07), 0.09, "#b58245");
}

function addArchitecture(target, floorColor, wallColor) {
  const { building, mezzanine, stairs, walls, railings, pillars } = BOARDGAME;
  const width = building.maxX - building.minX;
  const depth = building.maxZ - building.minZ;
  const centerZ = (building.minZ + building.maxZ) / 2;
  planks(target, building, 0, floorColor);
  for (const wall of walls) {
    const section = kit("boardgame-wall");
    const left = wall.x === building.minX;
    const front = wall.z === building.maxZ;
    section.group.userData.walkthroughOnly = left || front;
    section.group.userData.buildingWall = true;
    const bottom = front ? 2.5 : 0;
    surface(section, wall.width, wall.height - bottom, wall.depth, wallColor, wall.x, (wall.height + bottom) / 2, wall.z, "wall");
    if (!front) section.box(wall.width + 0.025, 0.18, wall.depth + 0.025, DARK_WOOD, wall.x, 0.09, wall.z, 0, true);
    section.box(wall.width + 0.05, 0.22, wall.depth + 0.05, "#4b3431", wall.x, wall.height - 0.05, wall.z, 0, true);
    target.group.add(section.group);
  }
  const deck = kit("boardgame-mezzanine");
  deck.group.userData.mezzanine = true;
  planks(deck, mezzanine, mezzanine.height, floorColor);
  const slab = deck.group.children[0];
  slab.name = "boardgame-mezzanine-deck";
  deck.box(width, 0.25, 0.15, "#665043", 0, mezzanine.height - 0.14, mezzanine.maxZ, 0, true);
  railings.forEach((entry) => rail(deck, entry, mezzanine.height));
  target.group.add(deck.group);
  for (const pillar of pillars) target.box(pillar.width, mezzanine.height, pillar.depth, METAL, pillar.x, mezzanine.height / 2, pillar.z);
  const stairKit = kit("boardgame-staircase");
  stairKit.group.userData.mezzanine = true;
  const stairWidth = stairs.maxX - stairs.minX;
  const run = stairs.maxZ - stairs.minZ;
  const rise = stairs.height / stairs.steps;
  const centerX = (stairs.minX + stairs.maxX) / 2;
  for (let i = 0; i < stairs.steps; i += 1) {
    const step = stairKit.box(stairWidth, 0.085, run / stairs.steps + 0.025, "#966638", centerX,
      rise * (i + 1) - 0.0425, stairs.maxZ - (i + 0.5) * run / stairs.steps, 0.006, true);
    step.name = "boardgame-stair-tread";
  }
  for (const x of [stairs.minX + 0.045, stairs.maxX - 0.045]) {
    beam(stairKit, [x, 0.08, stairs.maxZ], [x, stairs.height - 0.08, stairs.minZ], 0.13);
    beam(stairKit, [x, 1.04, stairs.maxZ], [x, stairs.height + 1.04, stairs.minZ], 0.07, "#b27c42");
    for (let i = 0; i <= 8; i += 1) {
      const z = stairs.maxZ - run * i / 8;
      const y = stairs.height * i / 8;
      beam(stairKit, [x, y, z], [x, y + 1.04, z], 0.045);
    }
  }
  target.group.add(stairKit.group);
  const overhead = kit("boardgame-ceiling-beams");
  overhead.group.userData.overhead = true;
  overhead.box(0.17, 0.2, depth, "#44352f", building.maxX - 0.2, building.height - 0.15, centerZ, 0, true);
  overhead.box(width, 0.22, 0.17, "#44352f", 0, building.height - 0.15, building.minZ + 0.2, 0, true);
  target.group.add(overhead.group);
  const interiorBeams = kit("boardgame-walkthrough-beams");
  interiorBeams.group.userData.walkthroughOnly = true;
  for (const x of [building.minX + 0.2, 0]) interiorBeams.box(0.17, 0.2, depth, "#44352f", x, building.height - 0.15, centerZ, 0, true);
  for (const z of [centerZ, building.maxZ - 0.2]) interiorBeams.box(width, 0.22, 0.17, "#44352f", 0, building.height - 0.15, z, 0, true);
  target.group.add(interiorBeams.group);
  const roof = kit("boardgame-ceiling");
  roof.group.userData.walkthroughOnly = true;
  surface(roof, width + 0.2, 0.18, depth + 0.2, "#3f332e", 0, building.height + 0.09, centerZ, "wall");
  target.group.add(roof.group);
  const entrance = kit("boardgame-entrance");
  entrance.group.userData.walkthroughOnly = true;
  for (const x of [-3.6, -0.4]) entrance.box(0.13, 2.7, 0.2, DARK_WOOD, x, 1.35, 5);
  entrance.box(3.12, 0.15, 0.2, DARK_WOOD, -2, 2.7, 5);
  entrance.box(3, building.height - 2.8, 0.24, wallColor, -2, (building.height + 2.8) / 2, 5);
  target.group.add(entrance.group);
}

function addNeon(target) {
  const sign = kit("good-game-neon");
  sign.group.position.set(0, 6.6, 0);
  const strokes = {
    G: [[[0.62, 0.86], [0.4, 1], [0.12, 0.87], [0.02, 0.48], [0.12, 0.08], [0.42, 0.02], [0.64, 0.2], [0.64, 0.5], [0.36, 0.5]]],
    o: [[[0.52, 0.53], [0.32, 0.68], [0.08, 0.58], [0.03, 0.26], [0.16, 0.04], [0.4, 0.05], [0.54, 0.27], [0.52, 0.53]]],
    d: [[[0.52, 0.53], [0.32, 0.68], [0.08, 0.58], [0.03, 0.26], [0.16, 0.04], [0.4, 0.05], [0.54, 0.27], [0.52, 0.53]], [[0.55, 1], [0.52, 0.5], [0.54, 0.04], [0.65, 0.08]]],
    a: [[[0.52, 0.53], [0.32, 0.68], [0.08, 0.58], [0.03, 0.26], [0.16, 0.04], [0.4, 0.05], [0.54, 0.27], [0.52, 0.53]], [[0.55, 0.66], [0.52, 0.3], [0.55, 0.04], [0.65, 0.08]]],
    m: [[[0.02, 0.03], [0.06, 0.63], [0.2, 0.65], [0.27, 0.46], [0.27, 0.04]], [[0.27, 0.45], [0.4, 0.66], [0.54, 0.61], [0.6, 0.03]]],
    e: [[[0.04, 0.32], [0.46, 0.38], [0.5, 0.58], [0.3, 0.68], [0.08, 0.55], [0.03, 0.24], [0.2, 0.03], [0.51, 0.1]]]
  };
  const neonMaterial = new THREE.MeshStandardMaterial({ color: "#ffddca", emissive: "#ff705b", emissiveIntensity: 5.5, roughness: 0.3, toneMapped: false });
  for (const [word, baseline] of [["Good", 0.1], ["Game", -1.08]]) {
    [...word].forEach((letter, index) => {
      for (const stroke of strokes[letter]) {
        const points = stroke.map(([x, y]) => new THREE.Vector3(-1.37 + index * 0.72 + x + y * 0.1, baseline + y, 0.02));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.018, 7, false), neonMaterial);
        tube.name = "neon-letter-stroke";
        tube.userData.roomBulb = true; tube.userData.roomBulbColor = "#ff705b"; tube.userData.roomBulbStrength = 5.5;
        sign.group.add(tube);
      }
    });
  }
  const glow = new THREE.PointLight("#ff624c", 9, 5, 1.5);
  glow.position.set(0, 0, 0.3);
  glow.userData.roomLamp = true; glow.userData.roomLampStrength = 9; glow.userData.roomLampColor = "#ff624c";
  sign.group.add(glow);
  target.group.add(sign.group);
}

function decorativeDie(target, x, y, z, size = 0.3) {
  const die = target.box(size, size, size, "#eddec0", x, y + size / 2, z, 0.035);
  die.name = "decorative-game-die";
  for (const [dx, dy] of [[-0.22, -0.22], [0.22, 0.22], [0, 0]]) {
    const dot = target.cylinder(size * 0.06, size * 0.06, 0.008, "#543d31", x + dx * size, y + size / 2 + dy * size, z + size / 2 + 0.004);
    dot.rotation.x = Math.PI / 2;
  }
}

function decorativeMeeple(target, x, y, z, color) {
  const outline = new THREE.Shape();
  outline.moveTo(-0.11, 0); outline.lineTo(-0.05, 0.13); outline.lineTo(-0.17, 0.13);
  outline.lineTo(-0.07, 0.25); outline.quadraticCurveTo(-0.09, 0.37, 0, 0.37);
  outline.quadraticCurveTo(0.09, 0.37, 0.07, 0.25); outline.lineTo(0.17, 0.13);
  outline.lineTo(0.05, 0.13); outline.lineTo(0.11, 0); outline.lineTo(0.025, 0);
  outline.lineTo(0, 0.08); outline.lineTo(-0.025, 0); outline.closePath();
  const mesh = target.mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.08, bevelEnabled: true, bevelSize: 0.009, bevelThickness: 0.009, bevelSegments: 2, steps: 1 }), color, x, y + 0.009, z - 0.04, true);
  mesh.name = "decorative-game-meeple";
}

function libraryUnit(style) {
  const item = kit(`library-${style}`);
  item.group.add(shelf(2.36, 0.62, 3, style === "wood" ? 0 : style === "display" ? 6 : 12, style));
  plant(item, 0.6, 3.01, 0, 0.23);
  if (style === "display") {
    decorativeDie(item, -0.4, 3.01, 0, 0.27);
    decorativeMeeple(item, 0.08, 3.01, 0, "#b59b45");
    item.group.children.at(-1).scale.setScalar(0.8);
  }
  return item.group;
}

function addWallArt(decor) {
  const panel = decor.box(2.7, 2.5, 0.1, "#8a7560", 0, 2.15, -0.13, 0.06, "fabric");
  panel.name = "upper-soft-wall-panel";
  decor.box(1.82, 1.55, 0.09, "#4a342a", 0, 2.3, -0.04, 0.018, true);
  decor.box(1.66, 1.39, 0.016, BOX_COLORS[2], 0, 2.3, 0.015);
  for (let tile = 0; tile < 7; tile += 1) {
    const angle = tile * Math.PI / 3;
    const hex = decor.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 6), BOX_COLORS[(tile + 2) % BOX_COLORS.length],
      tile ? Math.cos(angle) * 0.4 : 0, 2.3 + (tile ? Math.sin(angle) * 0.38 : 0), 0.03);
    hex.rotation.x = Math.PI / 2;
  }
  decor.box(1.95, 0.06, 0.27, "#af7c43", 0, 1.32, -0.01, 0.008, true);
  plant(decor, 0.57, 1.35, -0.01, 0.48);
  decor.box(0.12, 0.3, 0.16, METAL, 1.25, 3.06, 0, 0.025);
  warmBulb(decor, 1.25, 2.9, 0.17, 4, 4, 0.065);
}

export function createBoardgameFacility(kind) {
  const styles = { libraryShelfWood: "wood", libraryShelfDisplay: "display", libraryShelfDark: "black" };
  if (styles[kind]) return libraryUnit(styles[kind]);
  const item = kit(kind);
  if (kind === "gameWallBoard") {
    item.group.name = "boardgame-memory-board";
    item.box(4.8, 1.7, 0.1, "#b87d43", 0, 2.6, 0, 0.018, true);
    item.box(4.62, 1.52, 0.025, "#6e5040", 0, 2.6, 0.066);
  } else if (kind === "gameWallArt") addWallArt(item);
  else if (kind === "gameNeon") addNeon(item);
  else if (["pendantLight", "pendantBulb", "loftPendant", "shelfPendant"].includes(kind)) {
    const upper = kind === "loftPendant";
    const shelf = kind === "shelfPendant";
    pendant(item, 0, 0, upper ? 2.5 : shelf ? 3.08 : 3.2, upper ? 4.2 : shelf ? 3.34 : 7.8,
      { shade: !["pendantBulb", "shelfPendant"].includes(kind) });
  } else return null;
  return item.group;
}

function addTableGame(target) {
  target.box(1.55, 0.022, 1.05, "#244e59", 0, 0.803, 0, 0.012);
  target.box(1.45, 0.006, 0.95, "#d1b783", 0, 0.818, 0, 0.006);
  const tileColors = ["#b1b666", "#d3aa5b", "#769d8a", "#7191a3", "#bc8e63"];
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      if (Math.abs(row + col) > 3) continue;
      const hex = target.cylinder(0.112, 0.112, 0.012, tileColors[((row + 2) * 3 + col + 2) % tileColors.length],
        col * 0.215 + (row % 2) * 0.107, 0.828, row * 0.175);
      hex.geometry.dispose();
      hex.geometry = new THREE.CylinderGeometry(0.112, 0.112, 0.012, 6);
      target.cylinder(0.025, 0.025, 0.005, "#f2dfb5", hex.position.x, 0.839, hex.position.z);
    }
  }
  for (let i = 0; i < 12; i += 1) {
    const x = Math.sin(i * 2.3) * 0.58;
    const z = Math.cos(i * 1.8) * 0.37;
    const token = target.box(0.055, 0.09, 0.055, ["#b14d38", "#e3b758", "#487d91", "#718447"][i % 4], x, 0.873, z, 0.008);
    token.name = "game-piece";
  }
  for (const side of [-1, 1]) {
    for (const [index, x] of [-1.36, 0, 1.36].entries()) {
      const mat = target.box(1.02, 0.012, 0.57, side > 0 ? "#735748" : "#55706b", x, 0.808, side * 0.99, 0.045, "fabric");
      mat.name = "player-placemat";
      for (let card = 0; card < 3; card += 1) {
        const cx = x - 0.31 + card * 0.17;
        const paper = target.box(0.15, 0.008, 0.22, "#eee1bd", cx, 0.822 + card * 0.001, side * 0.97, 0.008);
        paper.name = "player-card";
        target.box(0.11, 0.004, 0.14, BOX_COLORS[index * 2 + (side > 0 ? 0 : 1)], cx, 0.829 + card * 0.001, side * 0.97, 0.002);
      }
      const cup = target.cylinder(0.08, 0.063, 0.16, ["#d0a369", "#788b7e", "#b67654"][index], x + 0.35, 0.89, side * 1.08);
      cup.name = "player-cup";
      target.cylinder(0.065, 0.065, 0.004, "#4a2e21", x + 0.35, 0.972, side * 1.08);
      const handle = target.mesh(new THREE.TorusGeometry(0.045, 0.013, 8, 12), "#d0a369", x + 0.43, 0.9, side * 1.08);
      handle.rotation.y = Math.PI / 2;
    }
    target.box(0.33, 0.07, 0.38, "#9d6b3c", side * 1.89, 0.84, 0, 0.018, true);
    for (let token = 0; token < 5; token += 1) target.cylinder(0.025, 0.025, 0.03, BOX_COLORS[token], side * 1.89 + ((token % 3) - 1) * 0.06, 0.89, (Math.floor(token / 3) - 0.5) * 0.08);
  }
  for (const [x, z] of [[0.95, -0.53], [-0.98, 0.53]]) {
    const die = target.box(0.11, 0.11, 0.11, "#f1e6ce", x, 0.855, z, 0.014);
    die.name = "game-die";
    for (const offset of [-0.025, 0.025]) target.cylinder(0.009, 0.009, 0.004, "#4a3c32", x + offset, 0.912, z + offset);
  }
}

function seam(target, points, color, radius = 0.005) {
  return target.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), 48, radius, 5, false), color);
}

function roundChair(target, color) {
  target.cylinder(0.44, 0.46, 0.1, DARK_WOOD, 0, 0.08, 0);
  const base = target.mesh(new THREE.SphereGeometry(1, 32, 16), color, 0, 0.3, 0, "fabric");
  base.scale.set(0.64, 0.22, 0.64);
  const seat = target.mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.Color(color).multiplyScalar(1.06), 0, 0.49, 0.06, "fabric");
  seat.name = "round-chair-seat";
  seat.scale.set(0.49, 0.13, 0.48);
  const vertices = [], indices = [], uvs = [], topSeam = [];
  const segments = 48, crossSegments = 16;
  for (let i = 0; i <= segments; i += 1) {
    const angle = -2.18 + i / segments * 4.36;
    const shoulder = Math.max(0, Math.cos(angle));
    const centerY = 0.65 + shoulder * 0.14;
    const rise = 0.2 + shoulder * 0.1;
    for (let j = 0; j <= crossSegments; j += 1) {
      const cross = j / crossSegments * Math.PI * 2;
      const radius = 0.53 + Math.cos(cross) * 0.14;
      vertices.push(Math.sin(angle) * radius, centerY + Math.sin(cross) * rise, -Math.cos(angle) * radius);
      uvs.push(i / segments * 2, j / crossSegments);
      if (i < segments && j < crossSegments) {
        const n = i * (crossSegments + 1) + j;
        indices.push(n, n + 1, n + crossSegments + 1, n + 1, n + crossSegments + 2, n + crossSegments + 1);
      }
    }
    topSeam.push([Math.sin(angle) * 0.53, centerY + rise + 0.002, -Math.cos(angle) * 0.53]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const back = target.mesh(geometry, color, 0, 0, 0, "fabric");
  back.name = "round-chair-wraparound-back";
  seam(target, topSeam, new THREE.Color(color).multiplyScalar(0.79), 0.006);
  for (const angle of [-2.18, 2.18]) {
    const end = target.mesh(new THREE.SphereGeometry(1, 16, 12), color,
      Math.sin(angle) * 0.53, 0.65, -Math.cos(angle) * 0.53, "fabric");
    end.scale.set(0.14, 0.2, 0.14);
  }
}

function clubSofa(target, color) {
  for (const x of [-1.48, 1.48]) for (const z of [-0.43, 0.43]) target.box(0.13, 0.22, 0.13, DARK_WOOD, x, 0.11, z, 0.014, true);
  target.box(3.56, 0.26, 1.15, color, 0, 0.32, 0, 0.08, "fabric");
  target.box(3.26, 0.75, 0.22, color, 0, 0.77, -0.46, 0.08, "fabric");
  for (const x of [-1.66, 1.66]) target.box(0.27, 0.62, 1.18, color, x, 0.64, 0, 0.12, "fabric");
  for (const x of [-1.04, 0, 1.04]) {
    const seat = target.box(1.01, 0.23, 0.87, new THREE.Color(color).multiplyScalar(1.05), x, 0.52, 0.11, 0.09, "fabric");
    seat.name = "sofa-seat-cushion";
    const back = target.box(1.0, 0.61, 0.21, color, x, 0.86, -0.3, 0.08, "fabric");
    back.rotation.x = -0.1;
    seam(target, [[x - 0.42, 0.61, 0.48], [x, 0.634, 0.51], [x + 0.42, 0.61, 0.48]], new THREE.Color(color).multiplyScalar(0.7));
  }
  for (const [x, pillowColor] of [[-1.24, "#b89263"], [1.24, "#777a61"]]) {
    const pillow = target.box(0.44, 0.45, 0.17, pillowColor, x, 0.81, -0.17, 0.075, "fabric");
    pillow.name = "sofa-throw-pillow";
    pillow.rotation.set(-0.17, 0, x < 0 ? -0.2 : 0.2);
  }
}

function credenza(target, color) {
  for (const x of [-1.6, 1.6]) for (const z of [-0.23, 0.23]) target.box(0.09, 0.15, 0.09, METAL, x, 0.075, z);
  target.box(3.56, 0.63, 0.05, DARK_WOOD, 0, 0.46, -0.28, 0, true);
  for (const x of [-1.75, -0.59, 0.59, 1.75]) target.box(0.07, 0.63, 0.59, color, x, 0.46, 0, 0.01, true);
  for (const y of [0.17, 0.46]) target.box(3.5, 0.045, 0.59, color, 0, y, 0, 0.01, true);
  target.box(3.6, 0.08, 0.65, color, 0, 0.81, 0, 0.02, true);
  for (let bay = 0; bay < 3; bay += 1) for (let row = 0; row < 2; row += 1) {
    for (let box = 0; box < 3; box += 1) {
      const x = (bay - 1) * 1.17 + (box - 1) * 0.31;
      const y = 0.29 + row * 0.29;
      target.box(0.27, 0.17 + box * 0.015, 0.4, BOX_COLORS[(bay * 3 + row + box) % BOX_COLORS.length], x, y, 0.025, 0.008);
      target.box(0.18, 0.018, 0.008, "#e2cba5", x, y + 0.025, 0.23);
    }
  }
  plant(target, 1.36, 0.85, 0, 0.5);
  decorativeDie(target, -1.31, 0.85, 0, 0.21);
  for (let i = 0; i < 3; i += 1) target.box(0.55, 0.055, 0.39, BOX_COLORS[i + 2], -0.5, 0.88 + i * 0.055, 0, 0.008);
}

export function createBoardgameFurniture(kind, { color } = {}) {
  if (kind === "gameShelf") return shelf(2.36, 0.51);
  if (!["gameTable", "gameChair", "floorLamp", "roundChair", "clubSofa", "gameCredenza", "loungeRug"].includes(kind)) return null;
  const item = kit(kind);
  if (kind === "gameTable") {
    for (const x of [-1.85, 1.85]) for (const z of [-1.05, 1.05]) item.box(0.13, 0.69, 0.13, "#715038", x, 0.345, z, 0.012, true);
    item.box(4.4, 0.11, 2.7, color || "#a36c36", 0, 0.745, 0, 0.04, true);
    item.box(4.15, 0.12, 2.45, "#79502f", 0, 0.64, 0, 0.015, true);
    addTableGame(item);
  } else if (kind === "roundChair") roundChair(item, color || "#496781");
  else if (kind === "clubSofa") clubSofa(item, color || "#56575e");
  else if (kind === "gameCredenza") credenza(item, color || "#966439");
  else if (kind === "loungeRug") {
    item.box(8.6, 0.026, 7.4, color || "#91806c", 0, 0.014, 0, 0.012, "fabric");
    item.box(8.2, 0.006, 7.0, "#746757", 0, 0.03, 0, 0.003, "fabric");
    for (const side of [-1, 1]) {
      for (let line = 0; line < 3; line += 1) {
        item.box(8.3 - line * 0.09, 0.002, 0.018, "#b59f7d", 0, 0.034, side * (3.56 - line * 0.055), 0, "fabric");
        item.box(0.018, 0.002, 6.95 - line * 0.09, "#b59f7d", side * (4.16 - line * 0.055), 0.034, 0, 0, "fabric");
      }
    }
    for (let row = -8; row <= 8; row += 1) {
      const stripe = item.box(7.95, 0.002, 0.012, row % 2 ? "#82715d" : "#9b886e", 0, 0.034, row * 0.38, 0, "fabric");
      stripe.name = "rug-woven-stripe";
    }
  } else if (kind === "gameChair") {
    const upholstery = color || "#bc8c48";
    for (const x of [-0.25, 0.25]) for (const z of [-0.23, 0.23]) item.box(0.045, 0.38, 0.045, DARK_WOOD, x, 0.19, z, 0.006, true);
    item.box(0.71, 0.15, 0.73, upholstery, 0, 0.45, 0.025, 0.09, "fabric");
    const back = item.box(0.7, 0.58, 0.15, upholstery, 0, 0.75, -0.3, 0.07, "fabric");
    back.rotation.x = -0.07;
    for (const x of [-0.335, 0.335]) item.box(0.08, 0.25, 0.52, upholstery, x, 0.59, 0.03, 0.04, "fabric");
    item.box(0.57, 0.03, 0.52, new THREE.Color(upholstery).multiplyScalar(1.08), 0, 0.533, 0.06, 0.012, "fabric");
  } else {
    item.cylinder(0.22, 0.25, 0.07, METAL, 0, 0.035, 0);
    item.cylinder(0.018, 0.025, 1.45, "#aa804a", 0, 0.78, 0);
    item.cylinder(0.19, 0.3, 0.36, "#dfbf86", 0, 1.69, 0);
    item.cylinder(0.3, 0.3, 0.025, "#a17845", 0, 1.51, 0);
    warmBulb(item, 0, 1.53, 0, 4, 5, 0.06);
  }
  return item.group;
}

export function createBoardgameShell({ floorColor = "#a86937", wallColor = "#70594b" } = {}) {
  const room = kit("boardgame-shell");
  room.group.userData.layout = "boardgame";
  addArchitecture(room, floorColor, wallColor);
  return room.group;
}
