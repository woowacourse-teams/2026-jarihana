import * as THREE from 'three';
import { characterVariant } from './character-motion.js';
import { studioMaterial } from './studio-materials.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const THIGH = 0.31, SHIN = 0.32;

export function createWalkingCharacters(scene, capacity) {
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
    corner.set(...corner.toArray().map(value => Math.sign(value) * Math.abs(value) ** 0.6));
    soft.attributes.position.setXYZ(index, corner.x, corner.y, corner.z);
    normal.set(...corner.toArray().map(value => Math.sign(value) * Math.abs(value) ** (2 / 0.6 - 1))).normalize();
    soft.attributes.normal.setXYZ(index, normal.x, normal.y, normal.z);
  }
  const collar = new THREE.TorusGeometry(1, 0.15, 8, 24);
  const smile = new THREE.TorusGeometry(0.095, 0.012, 6, 20, Math.PI * 0.72);
  // Follow the cheek surface so the smile stays attached in profile.
  const smileVertices = smile.attributes.position, smileTurn = Math.PI * 1.14;
  for (let index = 0; index < smileVertices.count; index++) {
    corner.fromBufferAttribute(smileVertices, index);
    const x = (corner.x * Math.cos(smileTurn) - corner.y * Math.sin(smileTurn)) * 0.82;
    const y = (corner.x * Math.sin(smileTurn) + corner.y * Math.cos(smileTurn)) * 0.82 - 0.059;
    const surface = 0.285 * Math.sqrt(Math.max(0, 1 - (x / 0.332) ** 2 - (y / 0.31) ** 2));
    smileVertices.setZ(index, (surface + 0.006 - 0.279) / 0.82 + corner.z * 0.7);
  }
  smile.computeVertexNormals();
  const colors = {
    skin: 0xf5c995, hair: 0x28292c, hairLock: 0x303135, face: 0x252427,
    sweater: 0xe2e1de, knit: 0xd0d0cc, blue: 0x456c91, navy: 0x2c4058,
    black: 0x303134, charcoal: 0x292a2d, mint: 0x36c2bb, white: 0xfaf8f2, sole: 0xe6e5e0,
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    studioMaterial({ color, roughness: name === 'hair' ? 0.72 : 0.58, clearcoat: 0.04 }),
  ]));
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
    if (!buckets.has(key)) buckets.set(key, { geometry: { sphere, rounded, soft, collar, smile }[shape], material: materials[material], parts: [[], []] });
    buckets.get(key).parts[variant].push(node);
    return node;
  }

  const rigs = [0, 1].map(variant => {
    const root = new THREE.Object3D();
    const torso = joint(root, [0, 0.78, 0]);
    const clothes = variant === 0 ? 'sweater' : 'black';
    const trousers = variant === 0 ? 'blue' : 'black';
    const rib = variant === 0 ? 'knit' : 'charcoal';
    part(torso, variant, trousers, [0, -0.045, -0.005], [0.275, 0.10, 0.16], [0, 0, 0], 'soft');
    part(torso, variant, clothes, [0, 0.29, 0], [0.31, 0.29, 0.205], [0, 0, 0], 'soft');
    part(torso, variant, rib, [0, 0.032, 0], [0.295, 0.038, 0.195], [0, 0, 0], 'rounded');
    part(torso, variant, 'skin', [0, 0.615, 0], [0.105, 0.105, 0.095]);
    part(torso, variant, rib, [0, 0.58, 0], [0.135, 0.115, 0.105], [Math.PI / 2, 0, 0], 'collar');

    const head = joint(torso, [0, 0.92, 0]);
    part(head, variant, 'skin', [0, 0, 0], [0.332, 0.31, 0.285]);
    for (const sign of [-1, 1]) {
      part(head, variant, 'skin', [sign * 0.328, -0.032, -0.005], [0.065, 0.082, 0.056]);
      part(head, variant, 'skin', [sign * 0.155, -0.092, 0.221], [0.12, 0.085, 0.065]);
      part(head, variant, 'face', [sign * 0.115, 0.025, 0.266], [0.025, 0.037, 0.019]);
      part(head, variant, 'white', [sign * 0.115 - 0.006, 0.037, 0.281], [0.006, 0.009, 0.004]);
      part(head, variant, 'face', [sign * 0.115, 0.113, 0.258], [0.049, 0.013, 0.015], [0, 0, sign * -0.13]);
    }
    part(head, variant, 'skin', [0, -0.04, 0.282], [0.039, 0.049, 0.049]);
    part(head, variant, 'face', [0, -0.059, 0.279], [0.82, 0.82, 0.82], [0, 0, Math.PI * 1.14], 'smile');
    part(head, variant, 'hair', [0, 0.205, -0.075], [0.345, 0.17, 0.28]);
    part(head, variant, 'hair', [-0.293, 0.075, -0.045], [0.07, 0.17, 0.19]);
    part(head, variant, 'hair', [0.293, 0.075, -0.045], [0.07, 0.17, 0.19]);
    if (variant === 0) {
      for (const [x, y, z, tilt, width] of [
        [-0.235, 0.20, 0.125, -0.6, 0.14], [-0.10, 0.255, 0.18, 0.25, 0.17],
        [0.065, 0.285, 0.155, 0.38, 0.16], [0.225, 0.22, 0.105, -0.5, 0.14],
        [-0.17, 0.315, -0.015, 0.3, 0.14], [0.045, 0.33, -0.02, -0.25, 0.14],
        [0.205, 0.285, -0.08, -0.2, 0.12], [-0.29, 0.115, 0.09, -0.75, 0.10],
      ]) {
        part(head, variant, 'hair', [x, y, z], [width, 0.093, 0.118], [0, 0, tilt]);
        part(head, variant, 'hairLock', [x - 0.014, y + 0.042, z + 0.077], [width * 0.66, 0.023, 0.027], [0, 0, tilt]);
      }
      part(torso, variant, 'navy', [0, 0.28, -0.24], [0.27, 0.28, 0.125], [0, 0, 0], 'rounded');
      part(torso, variant, 'navy', [0, 0.16, -0.37], [0.22, 0.12, 0.035], [0, 0, 0], 'rounded');
      for (const sign of [-1, 1]) {
        part(torso, variant, 'navy', [sign * 0.215, 0.33, 0.18], [0.034, 0.27, 0.035], [0, 0, sign * -0.08], 'rounded');
        part(torso, variant, 'charcoal', [sign * 0.202, 0.18, 0.218], [0.035, 0.038, 0.013], [0, 0, sign * -0.08], 'rounded');
      }
    } else {
      part(head, variant, 'hair', [-0.20, 0.19, 0.13], [0.14, 0.115, 0.12], [0, 0, -0.8]);
      for (const [x, y, z, width, tilt] of [
        [-0.075, 0.265, 0.18, 0.24, -0.28], [0.035, 0.215, 0.215, 0.23, -0.40],
        [0.14, 0.165, 0.175, 0.18, -0.52], [-0.055, 0.325, 0.045, 0.24, -0.20],
      ]) {
        part(head, variant, 'hair', [x, y, z], [width, 0.071, 0.115], [0, 0, tilt]);
        part(head, variant, 'hairLock', [x, y + 0.028, z + 0.079], [width * 0.85, 0.018, 0.021], [0, 0, tilt]);
      }
      for (const sign of [-1, 1]) {
        part(torso, variant, 'mint', [sign * 0.085, 0.40, 0.21], [0.014, 0.22, 0.012], [0, 0, sign * -0.38], 'rounded');
      }
      part(torso, variant, 'mint', [0, 0.223, 0.23], [0.021, 0.035, 0.015], [0, 0, 0], 'rounded');
      part(torso, variant, 'mint', [0, 0.12, 0.235], [0.085, 0.10, 0.018], [0, 0, 0], 'rounded');
      part(torso, variant, 'white', [0, 0.12, 0.256], [0.061, 0.075, 0.008], [0, 0, 0], 'rounded');
    }

    const arms = [-1, 1].map(sign => {
      const shoulder = joint(torso, [sign * 0.32, 0.46, 0]);
      part(shoulder, variant, clothes, [0, -0.12, 0], [0.117, 0.18, 0.12], [0, 0, 0], 'soft');
      const elbow = joint(shoulder, [0, -0.24, 0]);
      part(elbow, variant, clothes, [0, -0.085, 0], [0.105, 0.145, 0.11], [0, 0, 0], 'soft');
      part(elbow, variant, rib, [0, -0.19, 0], [0.092, 0.033, 0.098], [0, 0, 0], 'rounded');
      part(elbow, variant, 'skin', [0, -0.26, 0.015], [0.062, 0.074, 0.051]);
      for (const offset of [-0.034, 0, 0.034]) {
        part(elbow, variant, 'skin', [offset, -0.305, 0.021], [0.019, 0.038, 0.026]);
      }
      part(elbow, variant, 'skin', [-sign * 0.055, -0.205, 0.045], [0.035, 0.055, 0.035], [0, 0, -sign * 0.4]);
      return { sign, shoulder, elbow };
    });
    const legs = [-1, 1].map(sign => {
      const hip = joint(root, [sign * 0.14, 0.74, 0]);
      part(hip, variant, trousers, [0, -THIGH / 2, 0], [0.135, 0.205, 0.145], [0, 0, 0], 'soft');
      const knee = joint(hip, [0, -THIGH, 0]);
      part(knee, variant, trousers, [0, -SHIN / 2, 0], [0.13, 0.195, 0.14], [0, 0, 0], 'soft');
      const ankle = joint(knee, [0, -SHIN, 0]);
      part(ankle, variant, 'sole', [0, -0.075, 0.055], [0.15, 0.03, 0.225], [0, 0, 0], 'rounded');
      part(ankle, variant, 'white', [0, -0.01, 0.055], [0.148, 0.083, 0.215]);
      part(ankle, variant, 'white', [0, 0.042, 0.01], [0.085, 0.042, 0.095]);
      for (const z of [0.015, 0.052, 0.089]) {
        part(ankle, variant, 'sole', [0, 0.065 - z * 0.13, z], [0.07, 0.009, 0.011]);
      }
      return { sign, hip, knee, ankle };
    });
    return { root, torso, head, arms, legs };
  });

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const active = Array(capacity).fill(false);
  let visibleSlots = 0;
  const meshes = [];
  for (const bucket of buckets.values()) {
    bucket.stride = Math.max(...bucket.parts.map(parts => parts.length));
    const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, capacity * bucket.stride);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, zero);
    mesh.count = 0;
    mesh.instanceMatrix.needsUpdate = true;
    bucket.mesh = mesh;
    meshes.push(mesh);
    scene.add(mesh);
  }

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

  function draw(index, post, position, size, pose, yaw = 0) {
    active[index] = true;
    visibleSlots = Math.max(visibleSlots, index + 1);
    const variant = characterVariant(post);
    const rig = rigs[variant];
    const scale = size * (pose.scale ?? 1) * (pose.shrink ?? 1);
    const stride = clamp(pose.stride ?? 0, -1, 1);
    const crouch = clamp(pose.crouch ?? (pose.stage === 'packed' || pose.stage === 'bracing' ? 0.45 : 0), 0, 1);
    const time = pose.time ?? 0;
    const talk = pose.speaking ? Math.sin(time * 7) : 0;
    const gaitSettle = Math.abs(stride) * 0.04;
    rig.root.position.copy(position);
    rig.root.position.y += (pose.lift ?? 0) * size;
    rig.root.rotation.set(0, yaw, 0);
    rig.root.scale.setScalar(scale);
    rig.torso.position.y = 0.78 - crouch * 0.14 - gaitSettle;
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
      ankle.rotation.x = -hip.rotation.x - knee.rotation.x;
    }
    for (const { sign, shoulder, elbow } of rig.arms) {
      const base = sign < 0 ? (pose.leftArm ?? 0) : (pose.rightArm ?? 0);
      const gesture = pose.speaking && sign > 0 ? 1 : 0;
      shoulder.rotation.set(base + stride * sign * 0.48 - gesture * (0.6 + talk * 0.12), 0,
        sign * (0.10 + gesture * 0.16 + crouch * 0.04));
      elbow.rotation.x = -0.12 - crouch * 0.42 - gesture * (0.45 + talk * 0.16) - Math.abs(pose.wave ?? 0);
    }
    rig.root.updateMatrixWorld(true);
    for (const { mesh, parts, stride: count } of buckets.values()) {
      const selected = parts[variant];
      for (let partIndex = 0; partIndex < count; partIndex++) {
        mesh.setMatrixAt(index * count + partIndex, selected[partIndex]?.matrixWorld ?? zero);
      }
      mesh.count = visibleSlots * count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  return { draw, hide, pickMeshes: meshes };
}
