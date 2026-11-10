import { createAvatarInstanceBatch } from './avatar-instance-batch.js';
import { AVATAR_PARTS } from './avatar-part-definitions.js';
import * as THREE from 'three';
import { characterVariant } from './character-motion.js';
import { studioMaterial } from './studio-materials.js';
import { AVATAR_OPTIONS, AVATAR_PALETTE, readAvatarAppearance } from './avatar-appearance.js';
import { createCharacterSculpt, bendLimbMaterial, sculptSurface } from './character-sculpt.js';
import { createAvatarBrandSculpt } from './avatar-brand-sculpt.js';
import { createAvatarAccessories } from './avatar-accessories.js';
import { createAvatarBagShapes } from './avatar-bags.js';
import { createAvatarHandheldShapes } from './avatar-handheld.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const THIGH = 0.31, SHIN = 0.32;

export function createWalkingCharacters(scene, capacity, { lightweight = false } = {}) {
  const sphere = new THREE.SphereGeometry(1, 24, 18);
  const rounded = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8);
  const corner = new THREE.Vector3(), normal = new THREE.Vector3();
  const vertices = rounded.attributes.position, normals = rounded.attributes.normal;
  for (let index = 0; index < vertices.count; index++) {
    normal.fromBufferAttribute(vertices, index);
    corner.set(clamp(normal.x, -0.62, 0.62), clamp(normal.y, -0.62, 0.62), clamp(normal.z, -0.62, 0.62));
    normal.sub(corner).normalize();
    corner.addScaledVector(normal, 0.38);
    vertices.setXYZ(index, corner.x, corner.y, corner.z);
    normals.setXYZ(index, normal.x, normal.y, normal.z);
  }
  const soft = new THREE.SphereGeometry(1, 32, 24);
  for (let index = 0; index < soft.attributes.position.count; index++) {
    corner.fromBufferAttribute(soft.attributes.position, index);
    corner.set(...corner.toArray().map(value => Math.sign(value) * Math.abs(value) ** 0.84));
    soft.attributes.position.setXYZ(index, corner.x, corner.y, corner.z);
    normal.set(...corner.toArray().map(value => Math.sign(value) * Math.abs(value) ** (2 / 0.84 - 1))).normalize();
    soft.attributes.normal.setXYZ(index, normal.x, normal.y, normal.z);
  }
  const collar = new THREE.TorusGeometry(1, 0.17, 10, 96);
  for (let i = 0; i < collar.attributes.position.count; i++) {
    const angle = collar.attributes.uv.getX(i) * Math.PI * 2;
    corner.fromBufferAttribute(collar.attributes.position, i);
    const rib = 1 + 0.009 * Math.cos(angle * 48);
    collar.attributes.position.setXYZ(i, corner.x * rib, corner.y * rib, corner.z);
  }
  collar.computeVertexNormals();
  const sculpt = createCharacterSculpt();
  const avatarSculpt = createAvatarBrandSculpt();
  const accessorySculpt = createAvatarAccessories(avatarSculpt);
  const bagSculpt = createAvatarBagShapes();
  const itemSculpt = createAvatarHandheldShapes();
  const mouthPoints = Array.from({ length: 9 }, (_, i) => {
    const x = (i / 8 - 0.5) * 0.15, y = -0.116 + 0.026 * (x / 0.075) ** 2;
    const z = 0.292 * (1 - Math.abs(x / 0.33) ** (2 / 0.87) - Math.abs(y / 0.32) ** (2 / 0.88)) ** 0.44 + 0.009;
    return new THREE.Vector3(x, y, z);
  });
  const smile = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPoints), 20, 0.0065, 8, false);
  const flatMouth = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPoints.map(point => {
    const y = -0.105;
    const z = 0.292 * (1 - Math.abs(point.x / 0.33) ** (2 / 0.87) - Math.abs(y / 0.32) ** (2 / 0.88)) ** 0.44 + 0.009;
    return new THREE.Vector3(point.x, y, z);
  })), 20, 0.0065, 8, false);
  const eyebrow = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.043, 0, 0), new THREE.Vector3(0, 0.012, 0.003), new THREE.Vector3(0.043, 0, 0),
  ]), 12, 0.009, 8, false);
  const strapCurve = new THREE.CatmullRomCurve3([
    [0, 0.49, -0.21], [0, 0.61, -0.10], [0, 0.60, 0.06],
    [0, 0.47, 0.187], [-0.015, 0.28, 0.237], [-0.032, 0.12, 0.239], [-0.015, 0.025, 0.16],
  ].map(point => new THREE.Vector3(...point)));
  const strap = new THREE.TubeGeometry(strapCurve, 24, 0.034, 8, false);
  for (let index = 0; index < strap.attributes.position.count; index++) {
    corner.fromBufferAttribute(strap.attributes.position, index);
    const center = strapCurve.getPointAt(strap.attributes.uv.getX(index));
    strap.attributes.position.setXYZ(index, corner.x * 1.45, corner.y, center.z + (corner.z - center.z) * 0.45);
  }
  strap.computeVertexNormals();
  const colors = {
    skin: 0xffc894, ear: 0xe9a774, hair: 0x353330, avatarHair: 0x353330, face: 0x24201e,
    eyeGlint: 0xfff8ee, mouthInner: 0xc36c63,
    sweater: 0xbdbbb9, knit: 0xb0aeac, blue: 0x406387, navy: 0x26394e,
    black: 0x2c2d2f, charcoal: 0x27282a, mint: 0x24b6b0, white: 0xf6f5f1, sole: 0xdeddd9,
    pants: 0x302e2c, footwear: 0xf6f5f1, hat: 0x292726, hatTrim: 0x22201f, lenses: 0x243840,
    bag: 0x292726, bagTrim: 0x22201f, bagHardware: 0xc6c8c6,
    itemPaper: 0xf1e8d9, itemInk: 0x303437, itemCoffee: 0x684330, itemCover: 0xb56c5a,
    itemMetal: 0xb5bdc5, itemScreen: 0x243e47, itemGlass: 0xd4e5e3, itemIce: 0xdce9e7, itemAccent: 0x64bdb4,
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    lightweight ? new THREE.MeshLambertMaterial({ color }) : studioMaterial({ color, roughness: name === 'face' ? 0.4 : name === 'hair' ? 0.85 : 0.93,
      clearcoat: 0, envMapIntensity: name === 'hair' ? 0.35 : 0.22 }),
  ]));
  for (const [name, material] of Object.entries(materials)) {
    if (['face', 'mint', 'white', 'sole', 'ear', 'footwear', 'lenses', 'bagHardware', 'avatarHair', 'eyeGlint', 'mouthInner'].includes(name) || name.startsWith('item')) continue;
    material.userData.surface = name === 'skin' || name === 'hair' ? name : ['knit', 'charcoal', 'hatTrim'].includes(name) ? 'rib' : 'fabric';
    if (!lightweight) sculptSurface(material, material.userData.surface);
  }
  materials.complexion = materials.skin.clone();
  Object.assign(materials.itemGlass, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  if (!lightweight) Object.assign(materials.lenses, { roughness: 0.24, clearcoat: 0.45, envMapIntensity: 0.6 });
  if (!lightweight) {
    // The editable hair has broad sculpted locks; fine grain should not cut noisy stripes into them.
    Object.assign(materials.avatarHair, { roughness: 0.54, envMapIntensity: 0.42 });
    sculptSurface(materials.avatarHair, 'skin');
    Object.assign(materials.itemMetal, { metalness: 0.35, roughness: 0.38, envMapIntensity: 0.5 });
    Object.assign(materials.itemGlass, { roughness: 0.18, clearcoat: 0.5 });
    Object.assign(materials.bagHardware, { metalness: 0.45, roughness: 0.4 });
  }
  materials.complexion.vertexColors = true;
  if (!lightweight) sculptSurface(materials.complexion, 'skin');
  // Material color is white; each instance carries its own original or custom color.
  // This avoids one member's skin/clothes leaking into another slot.
  for (const material of Object.values(materials)) material.color.set(0xffffff);
  const roundGlasses = new THREE.TorusGeometry(0.077, 0.010, 8, 32);
  const squareGlasses = new THREE.TorusGeometry(0.077, 0.010, 8, 32);
  const squarePositions = squareGlasses.attributes.position;
  for (let i = 0; i < squarePositions.count; i++) {
    const angle = squareGlasses.attributes.uv.getX(i) * Math.PI * 2;
    const radius = 0.077 / (Math.cos(angle) ** 4 + Math.sin(angle) ** 4) ** 0.25;
    const ring = (squareGlasses.attributes.uv.getY(i) * Math.PI * 2);
    squarePositions.setXYZ(i, (radius + Math.cos(ring) * 0.010) * Math.cos(angle),
      (radius + Math.cos(ring) * 0.010) * Math.sin(angle), Math.sin(ring) * 0.010);
  }
  squareGlasses.computeVertexNormals();
  const rigCount = 2 + AVATAR_OPTIONS.hair.length;
  const buckets = new Map();

  function joint(parent, position) {
    const node = new THREE.Object3D();
    node.position.set(...position);
    parent.add(node);
    return node;
  }

  function part(parent, variant, material, position, scale, rotation = [0, 0, 0], shape = 'sphere') {
    const node = joint(parent, position);
    node.scale.set(...scale);
    node.rotation.set(...rotation);
    const key = `${material}:${shape}`;
    if (!buckets.has(key)) buckets.set(key, { geometry: { sphere, rounded, soft, collar, smile, flatMouth, eyebrow, strap, roundGlasses, squareGlasses, ...sculpt, ...avatarSculpt, ...accessorySculpt, ...bagSculpt, ...itemSculpt, avatarSweater: sculpt.sweater }[shape], shape, material: materials[material], materialName: material, parts: Array.from({ length: rigCount }, () => []) });
    buckets.get(key).parts[variant].push(node);
    return node;
  }

  function buildChoices(slot, parent, variant, extra = {}) {
    return Object.fromEntries(Object.values(AVATAR_PARTS[slot]).filter(definition => definition.build).map(definition =>
      [definition.id, definition.build({ parent, variant, part, joint, traits: definition.traits, ...extra })]));
  }

  const rigs = Array.from({ length: rigCount }, (_, variant) => {
    const custom = variant >= 2;
    const hair = AVATAR_OPTIONS.hair[variant - 2];
    const root = new THREE.Object3D();
    const torso = joint(root, [0, 0.78, 0]);
    torso.scale.x = 0.94;
    const clothes = variant === 0 ? 'sweater' : 'black';
    const trousers = custom ? 'pants' : variant === 0 ? 'blue' : 'black';
    const rib = variant === 0 ? 'knit' : 'charcoal';
    part(torso, variant, trousers, [0, -0.015, -0.005], [0.29, 0.065, 0.17], [0, 0, 0], 'soft');
    part(torso, variant, clothes, [0, 0.32, 0], custom ? [0.35, 0.31, 0.245] : [0.345, 0.33, 0.235], [0, 0, 0], custom ? 'avatarSweater' : 'sweater');
    part(torso, variant, rib, [0, 0.012, 0], [0.312, 0.036, 0.206], [0, 0, 0], 'soft');
    part(torso, variant, 'skin', [0, 0.652, 0], [0.117, 0.095, 0.108]);
    part(torso, variant, rib, [0, 0.638, 0], [0.147, 0.13, 0.175], [Math.PI / 2, 0, 0], 'collar');

    const head = joint(torso, [0, custom ? 0.91 : 0.95, 0]);
    head.scale.set(0.87, 0.86, 0.97);
    const face = part(head, variant, 'complexion', [0, 0, 0], [0.33, 0.32, 0.292], [0, 0, 0], custom ? 'avatarFace' : 'face');
    const eyes = [], eyebrows = [];
    for (const sign of [-1, 1]) {
      part(head, variant, 'skin', [sign * 0.327, -0.034, 0.015], custom ? [0.075, 0.087, 0.063] : [0.067, 0.081, 0.063]);
      part(head, variant, 'ear', [sign * 0.346, -0.032, 0.062], [0.031, 0.045, 0.011]);
      const eye = part(head, variant, 'face', [sign * 0.111, custom ? 0.025 : 0.018, custom ? 0.287 : 0.284], [0.026, 0.041, 0.019]);
      eyes.push(eye);
      if (custom) part(eye, variant, 'eyeGlint', [-0.28, 0.33, 0.91], [0.17, 0.12, 0.10]);
      eyebrows.push({ sign, node: part(head, variant, 'face', [sign * 0.112, 0.126, 0.265], [1, 1, 1], [0, 0, sign * -0.08], 'eyebrow') });
    }
    const nose = part(head, variant, 'skin', [0, -0.049, 0.296], [0.039, 0.042, 0.052]);
    const mouths = { smile: part(head, variant, 'face', [0, 0, 0], [1, 1, 1], [0, 0, 0], custom ? 'avatarSmile' : 'smile') };
    if (custom) {
      mouths.flat = part(head, variant, 'face', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'flatMouth');
      mouths.open = part(head, variant, 'face', [0, -0.105, 0.287], [0.037, 0.045, 0.016]);
      part(mouths.open, variant, 'mouthInner', [0, -0.40, 0.89], [0.63, 0.28, 0.15]);
    }
    const openMouth = custom ? null : part(head, variant, 'face', [0, -0.105, 0.29], [0, 0, 0]);
    const hairShape = custom ? AVATAR_PARTS.hair[hair].traits.shape : variant === 0 ? 'crewHair' : 'coachHair';
    const hairNodes = {};
    if (hairShape) {
      hairNodes.normal = part(head, variant, custom ? 'avatarHair' : 'hair', [0, 0, 0], [1, 1, 1], [0, 0, 0], hairShape);
      if (custom) hairNodes.fitted = part(head, variant, 'avatarHair', [0, 0, 0], [1, 1, 1], [0, 0, 0], `${hairShape}WithHat`);
    }
    const hats = custom ? buildChoices('hat', head, variant) : {};
    const glasses = custom ? buildChoices('glasses', head, variant) : {};
    if (!custom && variant === 0) {
      part(torso, variant, 'navy', [0, 0.29, -0.245], [0.29, 0.30, 0.145], [0, 0, 0], 'soft');
      part(torso, variant, 'navy', [0, 0.15, -0.385], [0.23, 0.14, 0.04], [0, 0, 0], 'soft');
      for (const sign of [-1, 1]) {
        part(torso, variant, 'navy', [sign * 0.228, 0, 0], [1, 1, 1], [0, 0, 0], 'strap');
        part(torso, variant, 'charcoal', [sign * 0.228 - 0.02, 0.225, 0.26], [0.037, 0.026, 0.012], [0, 0, 0], 'rounded');
      }
    } else if (!custom) {
      part(torso, variant, 'mint', [0, 0.02, 0], [1, 1, 1], [0, 0, 0], 'lanyard');
      part(torso, variant, 'mint', [0, 0.238, 0.246], [0.021, 0.035, 0.015], [0, 0, 0], 'rounded');
      part(torso, variant, 'mint', [0, 0.145, 0.255], [0.077, 0.101, 0.018], [0, 0, 0], 'rounded');
      part(torso, variant, 'white', [0, 0.145, 0.276], [0.061, 0.075, 0.008], [0, 0, 0], 'rounded');
    }

    const arms = [-1, 1].map(sign => {
      const shoulder = joint(torso, [sign * 0.30, 0.49, 0]);
      const fabric = part(shoulder, variant, clothes, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'sleeve');
      const elbow = joint(shoulder, [0, -0.24, 0]);
      fabric.userData.bendJoint = elbow;
      part(elbow, variant, rib, [0, -0.20, 0], [0.108, 0.034, 0.109], [0, 0, 0], 'soft');
      part(elbow, variant, 'skin', [0, -0.283, 0.009], custom ? [0.096, 0.108, 0.070] : [0.082, 0.103, 0.056]);
      const fingers = [-0.048, -0.016, 0.016, 0.048].map(offset =>
        part(elbow, variant, 'skin', [offset, -0.357 + Math.abs(offset) * 0.32, 0.029], custom ? [0.024, 0.046, 0.031] : [0.020, 0.046, 0.025]));
      const thumb = part(elbow, variant, 'skin', [-sign * 0.068, -0.282, 0.042], [0.029, 0.057, 0.030], [0, 0, -sign * 0.4]);
      return { sign, shoulder, elbow, fingers, thumb };
    });
    const legs = [-1, 1].map(sign => {
      const hip = joint(root, [sign * 0.18, 0.74, 0]);
      const fabric = part(hip, variant, trousers, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'trouser');
      const knee = joint(hip, [0, -THIGH, 0]);
      fabric.userData.bendJoint = knee;
      const ankle = joint(knee, [0, -SHIN, 0]);
      const shoes = custom ? buildChoices('shoes', ankle, variant) : {};
      if (!custom) {
        part(ankle, variant, 'sole', [0, -0.075, 0.065], [0.158, 0.03, 0.23], [0, 0, 0], 'rounded');
        part(ankle, variant, 'white', [0, -0.012, 0.064], [0.156, 0.076, 0.222]);
        part(ankle, variant, 'white', [0, 0.042, 0.01], [0.085, 0.042, 0.095]);
        for (const z of [0.015, 0.052, 0.089]) {
          part(ankle, variant, 'sole', [0, 0.065 - z * 0.13, z], [0.07, 0.009, 0.011]);
        }
      }
      return { sign, hip, knee, ankle, shoes };
    });
    const bags = custom ? buildChoices('bag', torso, variant, { hairTraits: AVATAR_PARTS.hair[hair].traits }) : {};
    const palm = joint(arms[1].elbow, [0, -0.30, 0.075]);
    const items = custom ? buildChoices('handheld', palm, variant) : {};
    return { root, torso, head, face, eyes, eyebrows, nose, mouths, mouth: mouths.smile, openMouth, glasses, arms, legs, hairNodes, hats, bags, palm, items };
  });

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const hands = Array.from({ length: capacity }, () => ({ leftHand: new THREE.Vector3(), rightHand: new THREE.Vector3() }));
  const meshes = [];
  for (const bucket of buckets.values()) {
    bucket.stride = Math.max(...bucket.parts.map(parts => parts.length));
    const count = capacity * bucket.stride;
    const pivot = bucket.shape === 'sleeve' ? -0.24 : bucket.shape === 'trouser' ? -THIGH : null;
    const geometry = pivot === null ? bucket.geometry : bucket.geometry.clone();
    const material = pivot === null ? bucket.material
      : bendLimbMaterial(lightweight ? bucket.material.clone() : sculptSurface(bucket.material.clone(), bucket.material.userData.surface), pivot);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    if (pivot !== null) {
      bucket.bends = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('limbBend', bucket.bends);
      mesh.customDepthMaterial = bendLimbMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), pivot);
      mesh.customDistanceMaterial = bendLimbMaterial(new THREE.MeshDistanceMaterial(), pivot);
    }
    mesh.userData.avatarMaterial = bucket.materialName;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = !lightweight && (['sweater', 'sleeve', 'trouser', 'strap'].includes(bucket.shape)
      || bucket.shape.startsWith('avatar') && !bucket.materialName.startsWith('item'));
    for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, zero);
    mesh.count = 0;
    mesh.instanceMatrix.needsUpdate = true;
    bucket.mesh = mesh;
    bucket.batch = createAvatarInstanceBatch(mesh, bucket.bends, bucket.stride);
    mesh.visible = false;
    meshes.push(mesh);
    scene.add(mesh);
  }
  // Limb copies own their instance attributes; the source surfaces are no longer needed.
  sculpt.sleeve.dispose();
  sculpt.trouser.dispose();

  const selections = Array(capacity).fill(null);
  function hide(index) {
    for (const bucket of selections[index]?.batches.keys() ?? []) bucket.batch.hide(index);
    selections[index] = null;
  }

  function isSelected(node) {
    for (let current = node; current; current = current.parent) {
      if (!current.visible || current.scale.x === 0 || current.scale.y === 0 || current.scale.z === 0) return false;
    }
    return true;
  }
  function updateSelectedMatrices(node) {
    if (!node.visible || node.parent && (node.scale.x === 0 || node.scale.y === 0 || node.scale.z === 0)) return;
    node.updateMatrix();
    if (node.parent) node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
    else node.matrixWorld.copy(node.matrix);
    for (const child of node.children) updateSelectedMatrices(child);
  }

  const capsuleOffset = new THREE.Vector3();
  const color = new THREE.Color();
  function appearanceColors(appearance) {
    if (!appearance) return { ...colors, complexion: colors.skin };
    const skin = AVATAR_PALETTE.skin[appearance.skin], clothes = AVATAR_PALETTE.outfit[appearance.outfit];
    return { ...colors, skin, complexion: skin, ear: new THREE.Color(skin).multiplyScalar(0.82),
      hair: AVATAR_PALETTE.hairColor[appearance.hairColor], avatarHair: AVATAR_PALETTE.hairColor[appearance.hairColor], black: clothes, sweater: clothes,
      footwear: AVATAR_PALETTE.shoeColor[appearance.shoeColor],
      hat: AVATAR_PALETTE.hatColor[appearance.hatColor],
      hatTrim: new THREE.Color(AVATAR_PALETTE.hatColor[appearance.hatColor]).multiplyScalar(0.82),
      bag: AVATAR_PALETTE.bagColor[appearance.bagColor],
      bagTrim: new THREE.Color(AVATAR_PALETTE.bagColor[appearance.bagColor]).multiplyScalar(0.80),
      charcoal: new THREE.Color(clothes).multiplyScalar(0.86), knit: new THREE.Color(clothes).multiplyScalar(0.86) };
  }
  const hangPivot = new THREE.Vector3(), rotatedHangPivot = new THREE.Vector3();
  const hangRotation = new THREE.Quaternion(), hangAxis = new THREE.Vector3(0, 0, 1);
  function draw(index, post, position, size, pose, yaw = 0, capsuleRotation = null) {
    const appearance = readAvatarAppearance(post?.appearance);
    const appearanceKey = appearance ? JSON.stringify(appearance) : '';
    const variant = appearance ? 2 + AVATAR_OPTIONS.hair.indexOf(appearance.hair) : characterVariant(post);
    const rig = rigs[variant];
    if (appearance) {
      for (const [kind, group] of Object.entries(rig.items)) group.scale.setScalar(appearance.handheld === kind ? 1 : 0);
      for (const [kind, group] of Object.entries(rig.bags)) group.scale.setScalar(appearance.bag === kind ? 1 : 0);
      for (const [kind, group] of Object.entries(rig.hats)) group.scale.setScalar(appearance.hat === kind ? 1 : 0);
      if (rig.hairNodes.normal) {
        rig.hairNodes.normal.scale.setScalar(AVATAR_PARTS.hat[appearance.hat].traits.coversUpperHair ? 0 : 1);
        rig.hairNodes.fitted.scale.setScalar(AVATAR_PARTS.hat[appearance.hat].traits.coversUpperHair ? 1 : 0);
      }
      for (const leg of rig.legs) {
        for (const [kind, shoe] of Object.entries(leg.shoes)) shoe.scale.setScalar(appearance.shoes === kind ? 1 : 0);
      }
      const dimensions = AVATAR_PARTS.face[appearance.face].traits.scale;
      rig.head.scale.set(...dimensions);
      for (const eye of rig.eyes) eye.scale.set(...AVATAR_PARTS.eyes[appearance.eyes].traits.scale);
      for (const { node } of rig.eyebrows) node.scale.set(...AVATAR_PARTS.eyebrows[appearance.eyebrows].traits.scale);
      rig.nose.scale.set(...AVATAR_PARTS.nose[appearance.nose].traits.scale);
      for (const [kind, mouth] of Object.entries(rig.mouths)) {
        if (!mouth.userData.originalScale) mouth.userData.originalScale = mouth.scale.clone();
        mouth.scale.copy(mouth.userData.originalScale).multiplyScalar(appearance.mouth === kind ? 1 : 0);
      }
      for (const [kind, group] of Object.entries(rig.glasses)) group.scale.setScalar(appearance.glasses === kind ? 1 : 0);
    }
    const scale = size * (pose.scale ?? 1) * (pose.shrink ?? 1);
    const seated = clamp(pose.seated ?? 0, 0, 1);
    const stride = clamp(pose.stride ?? 0, -1, 1) * (1 - seated);
    const hangBlend = pose.hanging ? clamp(pose.hangBlend ?? 1, 0, 1) : 0;
    const crouch = clamp(pose.crouch ?? (pose.stage === 'packed' || pose.stage === 'bracing' ? 0.9 : 0), 0, 1) * (1 - seated);
    const time = pose.time ?? 0;
    const talk = pose.speaking ? Math.sin(time * 7) : 0;
    const gaitSettle = Math.abs(stride) * 0.04;
    capsuleOffset.set(0, (pose.lift ?? 0) * size, 0);
    rig.root.rotation.set(pose.fallPitch ?? 0, yaw, pose.fallRoll ?? 0, 'YXZ');
    if (capsuleRotation) {
      capsuleOffset.applyQuaternion(capsuleRotation);
      rig.root.quaternion.premultiply(capsuleRotation);
    }
    rig.root.position.copy(position).add(capsuleOffset);
    rig.root.scale.setScalar(scale);
    if (pose.hanging) {
      hangRotation.setFromAxisAngle(hangAxis, (pose.hangAngle ?? 0) * hangBlend);
      rig.root.quaternion.premultiply(hangRotation);
    }
    rig.torso.position.y = 0.78 - crouch * 0.14 - gaitSettle - seated * 0.20;
    rig.torso.rotation.set(crouch * 0.15 + (pose.forwardLean ?? 0), stride * 0.04 + (pose.torsoTwist ?? 0), pose.lean ?? 0);
    rig.head.rotation.set((pose.head ?? 0) + talk * 0.035, talk * 0.04, -stride * 0.025);
    if (!appearance) {
      const anger = clamp(pose.anger ?? 0, 0, 1);
      const surprise = clamp(pose.surprise ?? 0, 0, 1);
      for (const { sign, node } of rig.eyebrows) {
        node.rotation.z = sign * (-0.08 + anger * 0.5 - surprise * 0.12);
        node.position.y = 0.126 - anger * 0.015 + surprise * 0.05;
      }
      for (const eye of rig.eyes) {
        eye.scale.x = 0.026 * (1 + surprise * 0.2);
        eye.scale.y = 0.041 * (1 - anger * 0.6 + surprise * 0.4);
      }
      const mouthOpen = clamp(pose.mouthOpen ?? 0, 0, 1);
      rig.mouth.scale.set(1 - mouthOpen * 0.5, (1 - anger * 2) * (1 - mouthOpen), 1);
      rig.mouth.position.y = -0.105 * (1 - rig.mouth.scale.y);
      rig.mouth.visible = surprise === 0 || mouthOpen === 0;
      rig.openMouth.scale.set(0.085 * (1 - surprise * 0.22) * mouthOpen,
        0.09 * (1 - surprise * 0.26) * mouthOpen, 0.018 * mouthOpen);
      rig.openMouth.visible = mouthOpen > 0;
    }

    for (const { sign, hip, knee, ankle } of rig.legs) {
      const travel = stride * sign;
      const lift = Math.max(0, travel) * (0.07 + (pose.stepLift ?? 0));
      const down = THIGH + SHIN - crouch * 0.14 - gaitSettle - lift;
      const forward = travel * 0.19 + crouch * 0.10 + sign * (pose.lunge ?? 0) * 0.3;
      const reach = clamp(Math.hypot(down, forward), 0.1, THIGH + SHIN - 0.001);
      const hipBend = Math.acos(clamp((THIGH * THIGH + reach * reach - SHIN * SHIN) / (2 * THIGH * reach), -1, 1));
      hip.position.y = 0.74 - crouch * 0.14 - gaitSettle;
      hip.rotation.x = -Math.atan2(forward, down) - hipBend;
      knee.rotation.x = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - reach * reach) / (2 * THIGH * SHIN), -1, 1));
      if (seated > 0) {
        const footHeight = hip.position.y - THIGH * Math.cos(hip.rotation.x) - SHIN * Math.cos(hip.rotation.x + knee.rotation.x);
        hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -1.35, seated);
        knee.rotation.x = THREE.MathUtils.lerp(knee.rotation.x, 1.35, seated);
        hip.position.y = THIGH * Math.cos(hip.rotation.x) + SHIN * Math.cos(hip.rotation.x + knee.rotation.x)
          + THREE.MathUtils.lerp(footHeight, 0.11, seated);
      }
      const kick = clamp((sign < 0 ? pose.leftKick : pose.rightKick) ?? 0, 0, 1) * (1 - seated);
      hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -1.65, kick);
      knee.rotation.x = THREE.MathUtils.lerp(knee.rotation.x, 0.18, kick);
      if (pose.hanging && pose.airRun !== undefined) {
        const pedal = clamp(pose.airRun, -1, 1) * sign;
        hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -.15 - pedal * .95, hangBlend);
        knee.rotation.x = THREE.MathUtils.lerp(knee.rotation.x, .55 + Math.max(0, -pedal) * 1.25, hangBlend);
      }
      ankle.rotation.x = -hip.rotation.x - knee.rotation.x + .22 * hangBlend;
    }
    for (const { sign, shoulder, elbow, fingers, thumb } of rig.arms) {
      const holdsWith = appearance && AVATAR_PARTS.handheld[appearance.handheld].traits.holdsWith;
      const carrying = holdsWith && sign > 0;
      const tray = carrying && holdsWith === 'tray';
      const arm = sign < 0 ? pose.leftArm : pose.rightArm;
      const bend = sign < 0 ? pose.leftElbow : pose.rightElbow;
      const spread = sign < 0 ? pose.leftSpread : pose.rightSpread;
      const gesture = pose.speaking && sign > 0 && arm === undefined ? 1 : 0;
      shoulder.rotation.set(arm ?? (carrying ? -0.18 : stride * sign * 0.48 - gesture * (0.6 + talk * 0.12)), 0,
        spread ?? (tray ? 0.22 : carrying ? -sign * 0.18 : sign * (0.10 + gesture * 0.16 + crouch * 0.04)));
      elbow.rotation.x = bend ?? (tray ? -1.35 : carrying ? -1.10 : -0.12 - crouch * 0.42 - gesture * (0.45 + talk * 0.16) - Math.abs(pose.wave ?? 0));
      const grip = clamp((sign < 0 ? pose.leftGrip : pose.rightGrip) ?? 0, 0, 1);
      const point = clamp((sign < 0 ? pose.leftPoint : pose.rightPoint) ?? 0, 0, 1);
      fingers.forEach((finger, index) => {
        const curl = grip * (index === (sign < 0 ? 3 : 0) ? 1 - point : 1);
        finger.position.y = -0.357 + Math.abs(finger.position.x) * 0.32 + curl * 0.065;
        finger.position.z = 0.029 + curl * 0.045;
        finger.scale.y = 0.046 - curl * 0.018;
        finger.rotation.x = -curl * 1.3;
      });
      thumb.position.x = -sign * (0.068 - grip * 0.024);
      thumb.position.z = 0.042 + grip * 0.03;
      thumb.rotation.z = -sign * (0.4 + grip * 0.65);
    }
    rig.palm.quaternion.copy(rig.arms[1].shoulder.quaternion).multiply(rig.arms[1].elbow.quaternion).invert();
    updateSelectedMatrices(rig.root);
    if (pose.hanging) {
      // Keep the animated crown in the hand even while ducking or throwing a punch.
      hangPivot.set(0, (2.08 - 0.78 - 0.95) / 0.86, 0).applyMatrix4(rig.head.matrixWorld);
      rotatedHangPivot.copy(position).y += 2.08 * scale;
      rig.root.position.addScaledVector(rotatedHangPivot.sub(hangPivot), hangBlend);
      updateSelectedMatrices(rig.root);
    }
    scene.updateWorldMatrix(true, false);
    for (const { sign, elbow } of rig.arms) {
      hands[index][sign < 0 ? 'leftHand' : 'rightHand'].set(0, -0.31, 0.02)
        .applyMatrix4(elbow.matrixWorld).applyMatrix4(scene.matrixWorld);
    }
    const selectionKey = `${variant}:${appearanceKey}:${scale === 0}:${appearance ? '' : [pose.anger ?? 0, pose.surprise ?? 0, pose.mouthOpen ?? 0].join(':')}`;
    let selection = selections[index];
    if (selection?.key !== selectionKey) {
      const batches = new Map();
      for (const bucket of buckets.values()) {
        const parts = bucket.parts[variant].map((node, partIndex) => ({ node, partIndex })).filter(({ node }) => isSelected(node));
        if (parts.length) batches.set(bucket, parts);
      }
      for (const bucket of selection?.batches.keys() ?? []) if (!batches.has(bucket)) bucket.batch.hide(index);
      selection = { key: selectionKey, batches, palette: appearanceColors(appearance) };
      selections[index] = selection;
    }
    for (const [bucket, parts] of selection.batches) {
      bucket.batch.update(index, parts, color.set(selection.palette[bucket.materialName]));
    }
    return hands[index];
  }

  function dispose() {
    const geometries = new Set([sphere, rounded, soft, collar, smile, flatMouth, eyebrow, strap, roundGlasses, squareGlasses, ...Object.values(sculpt), ...Object.values(avatarSculpt), ...Object.values(accessorySculpt), ...Object.values(bagSculpt), ...Object.values(itemSculpt)]);
    const ownedMaterials = new Set(Object.values(materials));
    for (const mesh of meshes) {
      geometries.add(mesh.geometry);
      for (const material of [mesh.material, mesh.customDepthMaterial, mesh.customDistanceMaterial].filter(Boolean)) ownedMaterials.add(material);
      mesh.removeFromParent(); mesh.dispose();
    }
    geometries.forEach(geometry => geometry.dispose()); ownedMaterials.forEach(material => material.dispose());
  }
  return { draw, hide, pickMeshes: meshes, dispose };
}
