import * as THREE from 'three';
import { characterVariant } from './character-motion.js';
import { studioMaterial } from './studio-materials.js';
import { createCharacterSculpt, bendLimbMaterial, sculptSurface } from './character-sculpt.js';

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
  const mouthPoints = Array.from({ length: 9 }, (_, i) => {
    const x = (i / 8 - 0.5) * 0.15, y = -0.116 + 0.026 * (x / 0.075) ** 2;
    const z = 0.292 * (1 - Math.abs(x / 0.33) ** (2 / 0.87) - Math.abs(y / 0.32) ** (2 / 0.88)) ** 0.44 + 0.009;
    return new THREE.Vector3(x, y, z);
  });
  const smile = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPoints), 20, 0.0065, 8, false);
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
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    studioMaterial({ color, roughness: name === 'face' ? 0.4 : name === 'hair' ? 0.85 : 0.93,
      clearcoat: 0, envMapIntensity: name === 'hair' ? 0.35 : 0.22 }),
  ]));
  for (const [name, material] of Object.entries(materials)) {
    if (['face', 'mint', 'white', 'sole', 'ear'].includes(name)) continue;
    material.userData.surface = name === 'skin' || name === 'hair' ? name : ['knit', 'charcoal'].includes(name) ? 'rib' : 'fabric';
    sculptSurface(material, material.userData.surface);
  }
  materials.complexion = materials.skin.clone();
  materials.complexion.vertexColors = true;
  sculptSurface(materials.complexion, 'skin');
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
    if (!buckets.has(key)) buckets.set(key, { geometry: { sphere, rounded, soft, collar, smile, eyebrow, strap, ...sculpt }[shape], shape, material: materials[material], parts: [[], []] });
    buckets.get(key).parts[variant].push(node);
    return node;
  }

  const rigs = [0, 1].map(variant => {
    const root = new THREE.Object3D();
    const torso = joint(root, [0, 0.78, 0]);
    torso.scale.x = 0.94;
    const clothes = variant === 0 ? 'sweater' : 'black';
    const trousers = variant === 0 ? 'blue' : 'black';
    const rib = variant === 0 ? 'knit' : 'charcoal';
    part(torso, variant, trousers, [0, -0.015, -0.005], [0.29, 0.065, 0.17], [0, 0, 0], 'soft');
    part(torso, variant, clothes, [0, 0.32, 0], [0.345, 0.33, 0.235], [0, 0, 0], 'sweater');
    part(torso, variant, rib, [0, 0.012, 0], [0.312, 0.036, 0.206], [0, 0, 0], 'soft');
    part(torso, variant, 'skin', [0, 0.652, 0], [0.117, 0.095, 0.108]);
    part(torso, variant, rib, [0, 0.638, 0], [0.147, 0.13, 0.175], [Math.PI / 2, 0, 0], 'collar');

    const head = joint(torso, [0, 0.95, 0]);
    head.scale.set(0.87, 0.86, 0.97);
    part(head, variant, 'complexion', [0, 0, 0], [0.33, 0.32, 0.292], [0, 0, 0], 'face');
    const eyebrows = [], eyes = [];
    for (const sign of [-1, 1]) {
      part(head, variant, 'skin', [sign * 0.327, -0.034, 0.015], [0.067, 0.081, 0.063]);
      part(head, variant, 'ear', [sign * 0.346, -0.032, 0.062], [0.031, 0.045, 0.011]);
      eyes.push(part(head, variant, 'face', [sign * 0.111, 0.018, 0.284], [0.026, 0.041, 0.019]));
      eyebrows.push({ sign, node: part(head, variant, 'face', [sign * 0.112, 0.126, 0.265], [1, 1, 1], [0, 0, sign * -0.08], 'eyebrow') });
    }
    part(head, variant, 'skin', [0, -0.049, 0.296], [0.039, 0.042, 0.052]);
    const mouth = part(head, variant, 'face', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'smile');
    const openMouth = part(head, variant, 'face', [0, -0.105, 0.29], [0, 0, 0]);
    part(head, variant, 'hair', [0, 0, 0], [1, 1, 1], [0, 0, 0], variant === 0 ? 'crewHair' : 'coachHair');
    if (variant === 0) {
      part(torso, variant, 'navy', [0, 0.29, -0.245], [0.29, 0.30, 0.145], [0, 0, 0], 'soft');
      part(torso, variant, 'navy', [0, 0.15, -0.385], [0.23, 0.14, 0.04], [0, 0, 0], 'soft');
      for (const sign of [-1, 1]) {
        part(torso, variant, 'navy', [sign * 0.228, 0, 0], [1, 1, 1], [0, 0, 0], 'strap');
        part(torso, variant, 'charcoal', [sign * 0.228 - 0.02, 0.225, 0.26], [0.037, 0.026, 0.012], [0, 0, 0], 'rounded');
      }
    } else {
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
      part(elbow, variant, 'skin', [0, -0.283, 0.009], [0.082, 0.103, 0.056]);
      const fingers = [-0.048, -0.016, 0.016, 0.048].map(offset =>
        part(elbow, variant, 'skin', [offset, -0.357 + Math.abs(offset) * 0.32, 0.029], [0.020, 0.046, 0.025]));
      const thumb = part(elbow, variant, 'skin', [-sign * 0.068, -0.282, 0.042], [0.029, 0.057, 0.030], [0, 0, -sign * 0.4]);
      return { sign, shoulder, elbow, fingers, thumb };
    });
    const legs = [-1, 1].map(sign => {
      const hip = joint(root, [sign * 0.18, 0.74, 0]);
      const fabric = part(hip, variant, trousers, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'trouser');
      const knee = joint(hip, [0, -THIGH, 0]);
      fabric.userData.bendJoint = knee;
      const ankle = joint(knee, [0, -SHIN, 0]);
      part(ankle, variant, 'sole', [0, -0.075, 0.065], [0.158, 0.03, 0.23], [0, 0, 0], 'rounded');
      part(ankle, variant, 'white', [0, -0.012, 0.064], [0.156, 0.076, 0.222]);
      part(ankle, variant, 'white', [0, 0.042, 0.01], [0.085, 0.042, 0.095]);
      for (const z of [0.015, 0.052, 0.089]) {
        part(ankle, variant, 'sole', [0, 0.065 - z * 0.13, z], [0.07, 0.009, 0.011]);
      }
      return { sign, hip, knee, ankle };
    });
    return { root, torso, head, eyebrows, eyes, mouth, openMouth, arms, legs };
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
      : bendLimbMaterial(sculptSurface(bucket.material.clone(), bucket.material.userData.surface), pivot);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    if (pivot !== null) {
      bucket.bends = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('limbBend', bucket.bends);
      mesh.customDepthMaterial = bendLimbMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), pivot);
      mesh.customDistanceMaterial = bendLimbMaterial(new THREE.MeshDistanceMaterial(), pivot);
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = ['sweater', 'sleeve', 'trouser', 'strap'].includes(bucket.shape);
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
  const hangPivot = new THREE.Vector3(), rotatedHangPivot = new THREE.Vector3();
  const hangRotation = new THREE.Quaternion(), hangAxis = new THREE.Vector3(0, 0, 1);
  function draw(index, post, position, size, pose, yaw = 0, capsuleRotation = null) {
    active[index] = true;
    visibleSlots = Math.max(visibleSlots, index + 1);
    const variant = characterVariant(post);
    const rig = rigs[variant];
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
      const arm = sign < 0 ? pose.leftArm : pose.rightArm;
      const bend = sign < 0 ? pose.leftElbow : pose.rightElbow;
      const spread = sign < 0 ? pose.leftSpread : pose.rightSpread;
      const gesture = pose.speaking && sign > 0 && arm === undefined ? 1 : 0;
      shoulder.rotation.set(arm ?? (stride * sign * 0.48 - gesture * (0.6 + talk * 0.12)), 0,
        spread ?? (sign * (0.10 + gesture * 0.16 + crouch * 0.04)));
      elbow.rotation.x = bend ?? (-0.12 - crouch * 0.42 - gesture * (0.45 + talk * 0.16) - Math.abs(pose.wave ?? 0));
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
    rig.root.updateMatrixWorld(true);
    if (pose.hanging) {
      // Keep the animated crown in the hand even while ducking or throwing a punch.
      hangPivot.set(0, (2.08 - 0.78 - 0.95) / 0.86, 0).applyMatrix4(rig.head.matrixWorld);
      rotatedHangPivot.copy(position).y += 2.08 * scale;
      rig.root.position.addScaledVector(rotatedHangPivot.sub(hangPivot), hangBlend);
      rig.root.updateMatrixWorld(true);
    }
    scene.updateWorldMatrix(true, false);
    for (const { sign, elbow } of rig.arms) {
      hands[index][sign < 0 ? 'leftHand' : 'rightHand'].set(0, -0.31, 0.02)
        .applyMatrix4(elbow.matrixWorld).applyMatrix4(scene.matrixWorld);
    }
    for (const { mesh, parts, bends, stride: count } of buckets.values()) {
      const selected = parts[variant];
      for (let partIndex = 0; partIndex < count; partIndex++) {
        const part = selected[partIndex];
        mesh.setMatrixAt(index * count + partIndex, part?.visible ? part.matrixWorld : zero);
        bends?.setX(index * count + partIndex, selected[partIndex]?.userData.bendJoint?.rotation.x ?? 0);
      }
      if (bends) bends.needsUpdate = true;
      mesh.count = visibleSlots * count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
    return hands[index];
  }

  return { draw, hide, pickMeshes: meshes };
}
