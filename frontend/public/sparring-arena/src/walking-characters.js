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
    skin: 0xffc894, ear: 0xe9a774, hair: 0x353330, face: 0x24201e,
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
    if (['face', 'mint', 'white', 'sole', 'ear', 'footwear', 'lenses', 'bagHardware'].includes(name) || name.startsWith('item')) continue;
    material.userData.surface = name === 'skin' || name === 'hair' ? name : ['knit', 'charcoal', 'hatTrim'].includes(name) ? 'rib' : 'fabric';
    if (!lightweight) sculptSurface(material, material.userData.surface);
  }
  materials.complexion = materials.skin.clone();
  Object.assign(materials.itemGlass, { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  if (!lightweight) Object.assign(materials.lenses, { roughness: 0.24, clearcoat: 0.45, envMapIntensity: 0.6 });
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
    const radius = 0.077 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
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

  function shoeChoices(ankle, variant) {
    return Object.fromEntries(AVATAR_OPTIONS.shoes.map(kind => {
      const shoe = joint(ankle, [0, 0, 0]);
      part(shoe, variant, 'sole', [0, -0.075, 0.065], [0.158, 0.03, 0.23], [0, 0, 0], 'rounded');
      if (kind === 'slipOn') {
        part(shoe, variant, 'footwear', [0, -0.012, 0.068], [0.163, 0.073, 0.231], [0, 0, 0], 'soft');
        part(shoe, variant, 'footwear', [0, 0.032, 0.08], [0.115, 0.026, 0.095], [0, 0, 0], 'soft');
        part(shoe, variant, 'sole', [0, 0.051, 0.104], [0.106, 0.008, 0.013]);
      } else {
        // Sneakers retain the existing shoe silhouette and detailing.
        part(shoe, variant, 'footwear', [0, -0.001, 0.064], [0.167, 0.087, 0.235]);
        part(shoe, variant, 'footwear', [0, 0.042, 0.01], [0.085, 0.042, 0.095]);
        if (kind === 'highTop') {
          part(shoe, variant, 'footwear', [0, 0.074, -0.005], [0.16, 0.115, 0.15], [0, 0, 0], 'soft');
          part(shoe, variant, 'footwear', [0, 0.084, 0.148], [0.09, 0.073, 0.04], [-0.12, 0, 0], 'soft');
          for (const y of [0.09, 0.13]) part(shoe, variant, 'sole', [0, y, 0.186], [0.075, 0.009, 0.011]);
        }
        for (const z of [0.015, 0.052, 0.089]) {
          part(shoe, variant, 'sole', [0, 0.065 - z * 0.13, z], [0.07, 0.009, 0.011]);
        }
      }
      return [kind, shoe];
    }));
  }

  function bagChoices(torso, variant, hair) {
    const backpack = joint(torso, [0, 0, 0]);
    const longHair = hair === 'long' || hair === 'flowing', back = longHair ? -0.55 : -0.38;
    part(backpack, variant, 'bag', [0, 0.29, back], [0.28, 0.29, 0.13], [0, 0, 0], 'soft');
    part(backpack, variant, 'bagTrim', [0, 0.15, back - 0.13], [0.22, 0.12, 0.04], [0, 0, 0], 'soft');
    part(backpack, variant, 'bagHardware', [0, 0.24, back - 0.17], [0.17, 0.007, 0.008], [0, 0, 0], 'rounded');
    for (const sign of [-1, 1]) {
      part(backpack, variant, 'bagTrim', [sign * 0.228, 0, 0], [1, 1, 1], [0, 0, 0], longHair ? 'avatarBackpackLongStrap' : 'avatarBackpackStrap');
      part(backpack, variant, 'bagHardware', [sign * 0.228, 0.20, 0.25], [0.028, 0.02, 0.008], [0, 0, 0], 'rounded');
    }
    const crossbody = joint(torso, [0, 0, 0]);
    part(crossbody, variant, 'bagTrim', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'avatarCrossbodyStrap');
    part(crossbody, variant, 'bag', [0.12, 0.04, 0.32], [0.21, 0.13, 0.08], [0, 0, -0.12], 'soft');
    part(crossbody, variant, 'bagTrim', [0.12, 0.08, 0.39], [0.185, 0.075, 0.014], [0, 0, -0.12], 'soft');
    part(crossbody, variant, 'bagHardware', [0.12, 0.02, 0.408], [0.028, 0.025, 0.006], [0, 0, -0.12], 'rounded');
    const shoulder = joint(torso, [0, 0, 0]);
    part(shoulder, variant, 'bagTrim', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'avatarShoulderStrap');
    part(shoulder, variant, 'bag', [0.42, -0.10, -0.21], [0.12, 0.20, 0.09], [0, 0, -0.05], 'soft');
    part(shoulder, variant, 'bagTrim', [0.42, 0.025, -0.12], [0.105, 0.06, 0.016], [0, 0, -0.05], 'soft');
    part(shoulder, variant, 'bagHardware', [0.42, 0, -0.101], [0.027, 0.021, 0.006], [0, 0, 0], 'rounded');
    return { backpack, crossbody, shoulder };
  }

  function itemChoices(palm, variant) {
    const hotCoffee = joint(palm, [0, 0, 0]);
    part(hotCoffee, variant, 'itemPaper', [0, 0.02, 0.05], [1, 1, 1], [0, 0, 0], 'avatarHotCup');
    part(hotCoffee, variant, 'itemCoffee', [0, 0.01, 0.05], [1, 1, 1], [0, 0, 0], 'avatarCupSleeve');
    part(hotCoffee, variant, 'itemInk', [0, 0.109, 0.05], [1, 1, 1], [0, 0, 0], 'avatarHotLid');
    const icedCoffee = joint(palm, [0, 0, 0]);
    part(icedCoffee, variant, 'itemGlass', [0, 0.04, 0.05], [1, 1, 1], [0, 0, 0], 'avatarColdCup');
    part(icedCoffee, variant, 'itemCoffee', [0, 0.025, 0.05], [1, 1, 1], [0, 0, 0], 'avatarCoffeeFill');
    part(icedCoffee, variant, 'itemGlass', [0, 0.151, 0.05], [1, 1, 1], [0, 0, 0], 'avatarColdLid');
    for (const [x, z] of [[-0.021, 0.037], [0.019, 0.071], [0.024, 0.028]]) {
      part(icedCoffee, variant, 'itemIce', [x, 0.113, z], [0.017, 0.018, 0.017], [0.2, x * 8, 0.3], 'rounded');
    }
    part(icedCoffee, variant, 'itemAccent', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'avatarStraw');
    const book = joint(palm, [0, 0.025, 0.045]); book.rotation.y = -0.2;
    part(book, variant, 'itemPaper', [0, 0, 0], [0.073, 0.102, 0.016], [0, 0, 0], 'rounded');
    for (const z of [-0.022, 0.022]) part(book, variant, 'itemCover', [0, 0, z], [0.080, 0.11, 0.005], [0, 0, 0], 'rounded');
    part(book, variant, 'itemCover', [-0.077, 0, 0], [0.008, 0.11, 0.023], [0, 0, 0], 'rounded');
    part(book, variant, 'itemPaper', [0, 0.035, 0.029], [0.045, 0.007, 0.002], [0, 0, 0], 'rounded');
    const phone = joint(palm, [0, 0.025, 0.055]);
    part(phone, variant, 'itemInk', [0, 0, 0], [0.046, 0.088, 0.011], [0, 0, 0], 'rounded');
    part(phone, variant, 'itemScreen', [0, 0, 0.012], [0.039, 0.075, 0.003], [0, 0, 0], 'rounded');
    part(phone, variant, 'itemPaper', [0, 0.077, 0.012], [0.012, 0.002, 0.002], [0, 0, 0], 'rounded');
    for (const y of [0.02, -0.005, -0.030]) part(phone, variant, 'itemAccent', [-0.005, y, 0.016], [0.022, 0.005, 0.001], [0, 0, 0], 'rounded');
    // Rest the base on one palm; the outward lid hides the keyboard from the front.
    const laptop = joint(palm, [0, 0, 0]);
    part(laptop, variant, 'itemMetal', [0, 0.035, 0], [0.23, 0.012, 0.15], [0, 0, 0], 'rounded');
    part(laptop, variant, 'itemInk', [0, 0.049, 0.04], [0.19, 0.002, 0.07], [0, 0, 0], 'rounded');
    part(laptop, variant, 'itemMetal', [0, 0.185, 0.135], [0.23, 0.14, 0.01], [0.18, 0, 0], 'rounded');
    part(laptop, variant, 'itemScreen', [0, 0.185, 0.122], [0.207, 0.118, 0.003], [0.18, 0, 0], 'rounded');
    part(laptop, variant, 'itemAccent', [0, 0.185, 0.149], [0.026, 0.026, 0.003]);
    part(laptop, variant, 'itemInk', [0, 0.049, -0.085], [0.062, 0.002, 0.037], [0, 0, 0], 'rounded');
    return { hotCoffee, icedCoffee, book, laptop, phone };
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
      eyes.push(part(head, variant, 'face', [sign * 0.111, custom ? 0.025 : 0.018, custom ? 0.287 : 0.284], [0.026, 0.041, 0.019]));
      eyebrows.push(part(head, variant, 'face', [sign * 0.112, 0.126, 0.265], [1, 1, 1], [0, 0, sign * -0.08], 'eyebrow'));
    }
    const nose = part(head, variant, 'skin', [0, -0.049, 0.296], [0.039, 0.042, 0.052]);
    const mouths = { smile: part(head, variant, 'face', [0, 0, 0], [1, 1, 1], [0, 0, 0], custom ? 'avatarSmile' : 'smile') };
    if (custom) {
      mouths.flat = part(head, variant, 'face', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'flatMouth');
      mouths.open = part(head, variant, 'face', [0, -0.105, 0.287], [0.037, 0.045, 0.016]);
    }
    const hairShape = custom ? { curly: 'avatarCurly', parted: 'avatarParted', bob: 'avatarBob', long: 'avatarLong', flowing: 'avatarFlowing' }[hair] : variant === 0 ? 'crewHair' : 'coachHair';
    const hairNodes = {};
    if (hairShape) {
      hairNodes.normal = part(head, variant, 'hair', [0, 0, 0], [1, 1, 1], [0, 0, 0], hairShape);
      if (custom) hairNodes.fitted = part(head, variant, 'hair', [0, 0, 0], [1, 1, 1], [0, 0, 0], `${hairShape}WithHat`);
    }
    const hats = {};
    if (custom) for (const kind of AVATAR_OPTIONS.hat.filter(value => value !== 'none')) {
      const group = joint(head, [0, 0, 0]); hats[kind] = group;
      const prefix = { cap: 'Cap', bucket: 'Bucket', beanie: 'Beanie', beret: 'Beret' }[kind];
      part(group, variant, 'hat', [0, 0, 0], [1, 1, 1], [0, 0, 0], `avatar${prefix}Crown`);
      const trim = { cap: 'Brim', bucket: 'Brim', beanie: 'Cuff', beret: 'Band' }[kind];
      part(group, variant, kind === 'beanie' || kind === 'beret' ? 'hatTrim' : 'hat', [0, 0, 0], [1, 1, 1], [0, 0, 0], `avatar${prefix}${trim}`);
      if (kind === 'beret') part(group, variant, 'hatTrim', [0.035, 0.535, -0.025], [0.022, 0.045, 0.022]);
      if (kind === 'cap') part(group, variant, 'hatTrim', [0, 0.515, -0.025], [0.035, 0.018, 0.035]);
    }
    const glasses = { round: [], square: [], sunglasses: [] };
    if (custom) for (const kind of Object.keys(glasses)) {
      for (const sign of [-1, 1]) {
        glasses[kind].push(part(head, variant, 'face', [sign * 0.111, 0.021, 0.324], [kind === 'sunglasses' ? 1.12 : 1, 0.88, 1], [0, 0, 0], `${kind === 'sunglasses' ? 'square' : kind}Glasses`));
        glasses[kind].push(part(head, variant, 'face', [sign * 0.202, 0.025, 0.19], [0.008, 0.008, 0.14], [0, sign * -0.10, 0], 'rounded'));
        if (kind === 'sunglasses') {
          glasses[kind].push(part(head, variant, 'lenses', [sign * 0.111, 0.021, 0.332], [0.076, 0.053, 0.009], [0, 0, 0], 'rounded'));
          glasses[kind].push(part(head, variant, 'sole', [sign * 0.111 - 0.02, 0.043, 0.343], [0.025, 0.003, 0.002], [0, 0, 0.5], 'rounded'));
        }
      }
      glasses[kind].push(part(head, variant, 'face', [0, 0.026, 0.33], [0.037, 0.007, 0.008], [0, 0, 0], 'rounded'));
    }
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
      for (const offset of [-0.048, -0.016, 0.016, 0.048]) {
        part(elbow, variant, 'skin', [offset, -0.357 + Math.abs(offset) * 0.32, 0.029], custom ? [0.024, 0.046, 0.031] : [0.020, 0.046, 0.025]);
      }
      part(elbow, variant, 'skin', [-sign * 0.068, -0.282, 0.042], [0.029, 0.057, 0.030], [0, 0, -sign * 0.4]);
      return { sign, shoulder, elbow };
    });
    const legs = [-1, 1].map(sign => {
      const hip = joint(root, [sign * 0.18, 0.74, 0]);
      const fabric = part(hip, variant, trousers, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'trouser');
      const knee = joint(hip, [0, -THIGH, 0]);
      fabric.userData.bendJoint = knee;
      const ankle = joint(knee, [0, -SHIN, 0]);
      const shoes = custom ? shoeChoices(ankle, variant) : {};
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
    const bags = custom ? bagChoices(torso, variant, hair) : {};
    const palm = joint(arms[1].elbow, [0, -0.30, 0.075]);
    const items = custom ? itemChoices(palm, variant) : {};
    return { root, torso, head, face, eyes, eyebrows, nose, mouths, glasses, arms, legs, hairNodes, hats, bags, palm, items };
  });

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const active = Array(capacity).fill(false);
  const hands = Array.from({ length: capacity }, () => ({ leftHand: new THREE.Vector3(), rightHand: new THREE.Vector3() }));
  let visibleSlots = 0;
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
    mesh.receiveShadow = !lightweight && ['sweater', 'sleeve', 'trouser', 'strap'].includes(bucket.shape);
    for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, zero);
    mesh.count = 0;
    mesh.instanceMatrix.needsUpdate = true;
    bucket.mesh = mesh;
    meshes.push(mesh);
    scene.add(mesh);
  }
  // Limb copies own their instance attributes; the source surfaces are no longer needed.
  sculpt.sleeve.dispose();
  sculpt.trouser.dispose();

  function hide(index) {
    active[index] = false;
    while (visibleSlots > 0 && !active[visibleSlots - 1]) visibleSlots--;
    for (const { mesh, stride } of buckets.values()) {
      for (let partIndex = 0; partIndex < stride; partIndex++) mesh.setMatrixAt(index * stride + partIndex, zero);
      mesh.count = visibleSlots * stride;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  const capsuleOffset = new THREE.Vector3();
  const color = new THREE.Color();
  const slotAppearances = Array(capacity).fill(undefined);
  function appearanceColors(appearance) {
    if (!appearance) return { ...colors, complexion: colors.skin };
    const skin = AVATAR_PALETTE.skin[appearance.skin], clothes = AVATAR_PALETTE.outfit[appearance.outfit];
    return { ...colors, skin, complexion: skin, ear: new THREE.Color(skin).multiplyScalar(0.82),
      hair: AVATAR_PALETTE.hairColor[appearance.hairColor], black: clothes, sweater: clothes,
      footwear: AVATAR_PALETTE.shoeColor[appearance.shoeColor],
      hat: AVATAR_PALETTE.hatColor[appearance.hatColor],
      hatTrim: new THREE.Color(AVATAR_PALETTE.hatColor[appearance.hatColor]).multiplyScalar(0.82),
      bag: AVATAR_PALETTE.bagColor[appearance.bagColor],
      bagTrim: new THREE.Color(AVATAR_PALETTE.bagColor[appearance.bagColor]).multiplyScalar(0.80),
      charcoal: new THREE.Color(clothes).multiplyScalar(0.86), knit: new THREE.Color(clothes).multiplyScalar(0.86) };
  }
  function draw(index, post, position, size, pose, yaw = 0, capsuleRotation = null) {
    active[index] = true;
    visibleSlots = Math.max(visibleSlots, index + 1);
    const appearance = readAvatarAppearance(post?.appearance);
    const appearanceKey = appearance ? JSON.stringify(appearance) : '';
    const variant = appearance ? 2 + AVATAR_OPTIONS.hair.indexOf(appearance.hair) : characterVariant(post);
    const rig = rigs[variant];
    if (appearance) {
      for (const [kind, group] of Object.entries(rig.items)) group.scale.setScalar(appearance.handheld === kind ? 1 : 0);
      for (const [kind, group] of Object.entries(rig.bags)) group.scale.setScalar(appearance.bag === kind ? 1 : 0);
      for (const [kind, group] of Object.entries(rig.hats)) group.scale.setScalar(appearance.hat === kind ? 1 : 0);
      if (rig.hairNodes.normal) {
        rig.hairNodes.normal.scale.setScalar(appearance.hat === 'none' ? 1 : 0);
        rig.hairNodes.fitted.scale.setScalar(appearance.hat === 'none' ? 0 : 1);
      }
      for (const leg of rig.legs) {
        for (const [kind, shoe] of Object.entries(leg.shoes)) shoe.scale.setScalar(appearance.shoes === kind ? 1 : 0);
      }
      const dimensions = { round: [1.16, 1.13, 1.10], oval: [1.07, 1.22, 1.10], wide: [1.27, 1.08, 1.10] }[appearance.face];
      rig.head.scale.set(...dimensions);
      for (const eye of rig.eyes) eye.scale.set(...{ round: [0.033, 0.052, 0.024], slim: [0.039, 0.025, 0.023], dot: [0.028, 0.033, 0.023] }[appearance.eyes]);
      for (const brow of rig.eyebrows) brow.scale.set(...{ arched: [1, 1, 1], straight: [1, 0.13, 1], bold: [1.14, 1.5, 1.4] }[appearance.eyebrows]);
      rig.nose.scale.set(...{ round: [0.047, 0.047, 0.058], small: [0.033, 0.034, 0.041], wide: [0.060, 0.039, 0.048] }[appearance.nose]);
      for (const [kind, mouth] of Object.entries(rig.mouths)) {
        if (!mouth.userData.originalScale) mouth.userData.originalScale = mouth.scale.clone();
        mouth.scale.copy(mouth.userData.originalScale).multiplyScalar(appearance.mouth === kind ? 1 : 0);
      }
      for (const [kind, nodes] of Object.entries(rig.glasses)) {
        for (const node of nodes) {
          if (!node.userData.originalScale) node.userData.originalScale = node.scale.clone();
          node.scale.copy(node.userData.originalScale).multiplyScalar(appearance.glasses === kind ? 1 : 0);
        }
      }
    }
    const recolor = slotAppearances[index] !== appearanceKey;
    const palette = recolor ? appearanceColors(appearance) : null;
    const scale = size * (pose.scale ?? 1) * (pose.shrink ?? 1);
    const seated = clamp(pose.seated ?? 0, 0, 1);
    const stride = clamp(pose.stride ?? 0, -1, 1) * (1 - seated);
    const crouch = clamp(pose.crouch ?? (pose.stage === 'packed' || pose.stage === 'bracing' ? 0.9 : 0), 0, 1) * (1 - seated);
    const time = pose.time ?? 0;
    const talk = pose.speaking ? Math.sin(time * 7) : 0;
    const gaitSettle = Math.abs(stride) * 0.04;
    capsuleOffset.set(0, (pose.lift ?? 0) * size, 0);
    rig.root.rotation.set(0, yaw, 0);
    if (capsuleRotation) {
      capsuleOffset.applyQuaternion(capsuleRotation);
      rig.root.quaternion.premultiply(capsuleRotation);
    }
    rig.root.position.copy(position).add(capsuleOffset);
    rig.root.scale.setScalar(scale);
    rig.torso.position.y = 0.78 - crouch * 0.14 - gaitSettle - seated * 0.20;
    rig.torso.rotation.set(crouch * 0.15, stride * 0.04, pose.lean ?? 0);
    rig.head.rotation.set((pose.head ?? 0) + talk * 0.035, talk * 0.04, -stride * 0.025);

    for (const { sign, hip, knee, ankle } of rig.legs) {
      const travel = stride * sign;
      const lift = Math.max(0, travel) * (0.07 + (pose.stepLift ?? 0));
      const down = THIGH + SHIN - crouch * 0.14 - gaitSettle - lift;
      const forward = travel * 0.19 + crouch * 0.10;
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
      ankle.rotation.x = -hip.rotation.x - knee.rotation.x;
    }
    for (const { sign, shoulder, elbow } of rig.arms) {
      const carrying = appearance && appearance.handheld !== 'none' && sign > 0;
      const tray = carrying && appearance.handheld === 'laptop';
      const arm = sign < 0 ? pose.leftArm : pose.rightArm;
      const bend = sign < 0 ? pose.leftElbow : pose.rightElbow;
      const spread = sign < 0 ? pose.leftSpread : pose.rightSpread;
      const gesture = pose.speaking && sign > 0 && arm === undefined ? 1 : 0;
      shoulder.rotation.set(arm ?? (carrying ? -0.18 : stride * sign * 0.48 - gesture * (0.6 + talk * 0.12)), 0,
        spread ?? (tray ? 0.22 : carrying ? -sign * 0.18 : sign * (0.10 + gesture * 0.16 + crouch * 0.04)));
      elbow.rotation.x = bend ?? (tray ? -1.35 : carrying ? -1.10 : -0.12 - crouch * 0.42 - gesture * (0.45 + talk * 0.16) - Math.abs(pose.wave ?? 0));
    }
    rig.palm.quaternion.copy(rig.arms[1].shoulder.quaternion).multiply(rig.arms[1].elbow.quaternion).invert();
    rig.root.updateMatrixWorld(true);
    scene.updateWorldMatrix(true, false);
    for (const { sign, elbow } of rig.arms) {
      hands[index][sign < 0 ? 'leftHand' : 'rightHand'].set(0, -0.31, 0.02)
        .applyMatrix4(elbow.matrixWorld).applyMatrix4(scene.matrixWorld);
    }
    for (const { mesh, parts, bends, materialName, stride: count } of buckets.values()) {
      const selected = parts[variant];
      for (let partIndex = 0; partIndex < count; partIndex++) {
        mesh.setMatrixAt(index * count + partIndex, selected[partIndex]?.matrixWorld ?? zero);
        if (recolor) mesh.setColorAt(index * count + partIndex, color.set(palette[materialName]));
        bends?.setX(index * count + partIndex, selected[partIndex]?.userData.bendJoint?.rotation.x ?? 0);
      }
      if (recolor) mesh.instanceColor.needsUpdate = true;
      if (bends) bends.needsUpdate = true;
      mesh.count = visibleSlots * count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
    slotAppearances[index] = appearanceKey;
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
