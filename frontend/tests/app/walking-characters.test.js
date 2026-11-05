import * as THREE from 'three';
import { createWalkingCharacters } from '../../public/sparring-arena/src/walking-characters.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

const crew = { memberType: 'CREW' }, coach = { memberType: 'COACH' };
function snapshot(models, slot) {
  return models.pickMeshes.map(mesh => {
    const length = mesh.instanceMatrix.array.length / 2;
    return Array.from(mesh.instanceMatrix.array.slice(slot * length, (slot + 1) * length));
  });
}
function bounds(models, slot) {
  const box = new THREE.Box3(), matrix = new THREE.Matrix4();
  for (const mesh of models.pickMeshes) {
    mesh.geometry.computeBoundingBox();
    const count = mesh.instanceMatrix.count / 2;
    for (let index = slot * count; index < (slot + 1) * count; index++) {
      mesh.getMatrixAt(index, matrix);
      if (Math.abs(matrix.determinant()) > 1e-8) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
  }
  return box;
}

it('캐릭터는 깊이가 있는 입체 부품이고, 걸을 때 몸 안의 관절도 움직인다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 0 });
  const standing = snapshot(models, 0), size = bounds(models, 0).getSize(new THREE.Vector3());
  expect(size.x).toBeGreaterThan(0.6);
  expect(size.y).toBeGreaterThan(2);
  expect(size.z).toBeGreaterThan(0.5);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 1, stepLift: 0.08 });
  expect(snapshot(models, 0)).not.toEqual(standing);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: -1, stepLift: 0.08 });
  expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 0 });
  expect(snapshot(models, 0)).toEqual(standing);
});

it('한 인물의 교체·숨김이 다른 인물의 자세나 부품을 바꾸지 않는다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  models.draw(0, crew, new THREE.Vector3(-2, 0, 0), 1, { stride: 0 });
  models.draw(1, coach, new THREE.Vector3(2, 0, 0), 1, { stride: 0 });
  const other = snapshot(models, 1);
  expect(models.pickMeshes.every(mesh => mesh.count === mesh.instanceMatrix.count)).toBe(true);
  models.draw(0, coach, new THREE.Vector3(-2, 0, 0), 1, { stride: 1 });
  expect(snapshot(models, 1)).toEqual(other);
  models.hide(0);
  expect(bounds(models, 0).isEmpty()).toBe(true);
  expect(snapshot(models, 1)).toEqual(other);
  expect(bounds(models, 1).isEmpty()).toBe(false);
  models.hide(1);
  expect(models.pickMeshes.every(mesh => mesh.count === 0)).toBe(true);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 0 });
  expect(models.pickMeshes.every(mesh => mesh.count === mesh.instanceMatrix.count / 2)).toBe(true);
});

it.each([crew, coach])('보행 중 지지발은 바닥에 남고 몸은 바닥 아래로 꺼지지 않는다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  for (let stride = -1; stride <= 1; stride += 0.125) {
    models.draw(0, post, new THREE.Vector3(), 1, { stride, stepLift: Math.abs(stride) * 0.08 });
    expect(bounds(models, 0).min.y).toBeGreaterThanOrEqual(-0.005);
    expect(bounds(models, 0).min.y).toBeLessThan(0.02);
  }
});

it('연속된 옷의 굽힘은 슬롯마다 독립적이고 그림자에도 같은 관절을 사용한다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 0 });
  models.draw(1, coach, new THREE.Vector3(2, 0, 0), 1, { stride: 0 });
  const limbs = models.pickMeshes.filter(mesh => mesh.geometry.hasAttribute('limbBend'));
  expect(limbs.length).toBeGreaterThan(0);
  const angles = limbs.map(mesh => Array.from(mesh.geometry.getAttribute('limbBend').array));
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 1, speaking: true, time: 1 });
  expect(limbs.map(mesh => Array.from(mesh.geometry.getAttribute('limbBend').array))).not.toEqual(angles);
  limbs.forEach((mesh, i) => {
    const current = Array.from(mesh.geometry.getAttribute('limbBend').array);
    expect(current.every(Number.isFinite)).toBe(true);
    expect(current.slice(current.length / 2)).toEqual(angles[i].slice(current.length / 2));
    const shaders = [mesh.material, mesh.customDepthMaterial, mesh.customDistanceMaterial].map(material => {
      const shader = { vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>', fragmentShader: '' };
      material.onBeforeCompile(shader);
      return shader.vertexShader.match(/vec3 hinge = [^;]+;\s*transformed = [^;]+;/)?.[0];
    });
    expect(shaders[0]).toBeTruthy();
    expect(shaders[1]).toEqual(shaders[0]);
    expect(shaders[2]).toEqual(shaders[0]);
  });
});


it('소매와 바지 겉면이 바깥을 향해 닫힌 옷으로 렌더링된다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const limbs = models.pickMeshes.filter(mesh => mesh.geometry.hasAttribute('limbBend'));
  for (const mesh of limbs) {
    const positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal;
    let outward = 0, samples = 0;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      if (y > -0.08 || y < -0.38) continue;
      const x = positions.getX(i), z = positions.getZ(i);
      outward += (x * normals.getX(i) + z * normals.getZ(i)) / Math.hypot(x, z);
      samples++;
    }
    expect(samples).toBeGreaterThan(0);
    expect(outward / samples).toBeGreaterThan(0.8);
  }
});

it('캡슐 안의 자세는 중심을 기준으로 함께 회전하고 밖에서는 다시 똑바로 선다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const pose = { stage: 'packed', scale: 0.31, lift: -0.34, shrink: 1 };
  models.draw(0, crew, new THREE.Vector3(), 1, pose);
  const packed = snapshot(models, 0);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 0.3, 1.2));
  models.draw(0, crew, new THREE.Vector3(), 1, pose, 0, rotation);
  const rotated = snapshot(models, 0);
  const turn = new THREE.Matrix4().makeRotationFromQuaternion(rotation);
  for (let part = 0; part < packed.length; part++) {
    for (let offset = 0; offset < packed[part].length; offset += 16) {
      const expected = new THREE.Matrix4().fromArray(packed[part], offset).premultiply(turn).elements;
      expected.forEach((value, index) => expect(rotated[part][offset + index]).toBeCloseTo(value, 5));
    }
  }
  models.draw(0, crew, new THREE.Vector3(), 1, pose);
  expect(snapshot(models, 0)).toEqual(packed);
});

it.each([crew, coach])('의자에 앉고 일어나는 동안 발은 바닥을 유지하고 원래 자세로 돌아온다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  models.draw(0, post, new THREE.Vector3(), 1, {});
  const standing = snapshot(models, 0), standingHeight = bounds(models, 0).max.y;
  for (const seated of [0.25, 0.5, 0.75, 1]) {
    models.draw(0, post, new THREE.Vector3(), 1, { seated });
    expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
    const box = bounds(models, 0);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.005);
    expect(box.min.y).toBeLessThan(0.02);
  }
  expect(bounds(models, 0).max.y).toBeCloseTo(standingHeight - 0.20, 4);
  models.draw(0, post, new THREE.Vector3(), 1, {});
  expect(snapshot(models, 0)).toEqual(standing);
});

it('손 위치는 몸의 이동·회전·크기를 따르며 다른 슬롯의 자세에 영향받지 않는다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const pose = { seated: 1, leftArm: -1.3, rightArm: -1.3, leftElbow: -0.5, rightElbow: -0.5,
    leftSpread: -0.2, rightSpread: 0.2 };
  const first = models.draw(0, crew, new THREE.Vector3(), 1, pose);
  const original = { leftHand: first.leftHand.clone(), rightHand: first.rightHand.clone() };
  const position = new THREE.Vector3(3, 2, -1), yaw = Math.PI / 2, scale = 0.7;
  const second = models.draw(1, crew, position, scale, pose, yaw);
  for (const name of ['leftHand', 'rightHand']) {
    const expected = original[name].clone().multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(position);
    expect(second[name].distanceTo(expected)).toBeLessThan(1e-6);
    expect(first[name].toArray()).toEqual(original[name].toArray());
    expect(second[name]).not.toBe(first[name]);
  }
  const other = snapshot(models, 1);
  models.draw(0, coach, new THREE.Vector3(-3, 0, 0), 1, { seated: 0.5 });
  expect(snapshot(models, 1)).toEqual(other);
});

it('의자를 잡는 명시적인 어깨·팔꿈치 자세는 말하기 동작보다 우선한다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const pose = { leftArm: -1.1, rightArm: -1.2, leftElbow: -0.3, rightElbow: -0.4,
    leftSpread: -0.25, rightSpread: 0.3, speaking: true };
  const first = models.draw(0, crew, new THREE.Vector3(), 1, { ...pose, time: 0 });
  const hands = { leftHand: first.leftHand.clone(), rightHand: first.rightHand.clone() };
  const second = models.draw(0, crew, new THREE.Vector3(), 1, { ...pose, time: 1 });
  for (const name of ['leftHand', 'rightHand']) expect(second[name].toArray()).toEqual(hands[name].toArray());
  models.draw(0, crew, new THREE.Vector3(), 1, {});
  expect(second.rightHand.distanceTo(hands.rightHand)).toBeGreaterThan(0.2);
});

// These cases exercise instance isolation and geometry through the same renderer used by the arena.
const { AVATAR_PRESETS } = require('../../public/sparring-arena/src/avatar-appearance.js');
it('카드용 경량 조명에서도 선택한 파츠·색·관절 위치는 편집 미리보기와 같다', () => {
  const detailed = createWalkingCharacters(new THREE.Scene(), 2);
  const card = createWalkingCharacters(new THREE.Scene(), 2, { lightweight: true });
  try {
    for (const preset of AVATAR_PRESETS) {
      const post = { appearance: preset.appearance };
      detailed.draw(0, post, new THREE.Vector3(), 1, { stride: 0.5 });
      card.draw(0, post, new THREE.Vector3(), 1, { stride: 0.5 });
      expect(snapshot(card, 0)).toEqual(snapshot(detailed, 0));
      expect(colorSnapshot(card, 0)).toEqual(colorSnapshot(detailed, 0));
    }
    expect(card.pickMeshes.every(mesh => mesh.material.isMeshLambertMaterial)).toBe(true);
  } finally { detailed.dispose(); card.dispose(); }
});
function colorSnapshot(models, slot) {
  return models.pickMeshes.map(mesh => {
    const count = mesh.instanceMatrix.count / 2;
    return Array.from(mesh.instanceColor.array.slice(slot * count * 3, (slot + 1) * count * 3));
  });
}
it('커스텀 외형을 바꾸거나 기본 외형으로 돌아가도 다른 인물의 파츠·색은 유지된다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  models.draw(0, { appearance: AVATAR_PRESETS[0].appearance }, new THREE.Vector3(), 1, {});
  models.draw(1, { appearance: AVATAR_PRESETS[3].appearance }, new THREE.Vector3(2, 0, 0), 1, {});
  const otherMatrices = snapshot(models, 1), otherColors = colorSnapshot(models, 1);
  const firstColors = colorSnapshot(models, 0);
  for (const preset of AVATAR_PRESETS.slice(1)) {
    models.draw(0, { appearance: preset.appearance }, new THREE.Vector3(), 1, { stride: 0.8, speaking: true, time: 1 });
    expect(colorSnapshot(models, 0)).not.toEqual(firstColors);
    expect(snapshot(models, 1)).toEqual(otherMatrices);
    expect(colorSnapshot(models, 1)).toEqual(otherColors);
  }
  models.draw(0, crew, new THREE.Vector3(), 1, {});
  expect(snapshot(models, 1)).toEqual(otherMatrices);
  expect(colorSnapshot(models, 1)).toEqual(otherColors);
});

it.each(AVATAR_PRESETS)('$name: 보행·캡슐 회전 중 좌표가 유효하고 지지발이 바닥에 남는다', preset => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), post = { appearance: preset.appearance };
  for (const stride of [-1, 0, 1]) {
    models.draw(0, post, new THREE.Vector3(), 1, { stride, stepLift: 0.08 });
    const box = bounds(models, 0);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.005);
    expect(box.min.y).toBeLessThan(0.02);
    expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
  }
  models.draw(0, post, new THREE.Vector3(), 1, { stage: 'packed', scale: 0.31, lift: -0.34 }, 0,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 0.3, 1.2)));
  expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
});

it('잘못된 커스텀 설정은 기존 회원 유형의 외형과 같은 파츠·색으로 돌아간다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  models.draw(0, coach, new THREE.Vector3(), 1, {});
  const original = snapshot(models, 0), originalColors = colorSnapshot(models, 0);
  models.draw(0, { ...coach, appearance: { ...AVATAR_PRESETS[0].appearance, version: 999 } }, new THREE.Vector3(), 1, {});
  expect(snapshot(models, 0)).toEqual(original);
  expect(colorSnapshot(models, 0)).toEqual(originalColors);
});

it.each([
  ['eyebrows', 'straight'], ['eyebrows', 'bold'], ['nose', 'small'], ['nose', 'wide'],
  ['mouth', 'flat'], ['mouth', 'open'], ['eyes', 'dot'],
])('%s=%s를 같은 머리 모델에서 바꿔도 다른 슬롯의 얼굴은 유지된다', (part, value) => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), appearance = AVATAR_PRESETS[0].appearance;
  try {
    models.draw(0, { appearance }, new THREE.Vector3(), 1, {});
    models.draw(1, { appearance }, new THREE.Vector3(2, 0, 0), 1, {});
    const before = snapshot(models, 0), other = snapshot(models, 1);
    models.draw(0, { appearance: { ...appearance, [part]: value } }, new THREE.Vector3(), 1, {});
    expect(snapshot(models, 0)).not.toEqual(before);
    expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
    expect(snapshot(models, 1)).toEqual(other);
    models.draw(0, { appearance }, new THREE.Vector3(), 1, {});
    expect(snapshot(models, 0)).toEqual(before);
  } finally { models.dispose(); }
});
