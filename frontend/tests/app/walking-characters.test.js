import * as THREE from 'three';
import { createWalkingCharacters } from '../../public/sparring-arena/src/walking-characters.js';
import { heldReactionPose } from '../../public/sparring-arena/src/held-reactions.js';
import { releasedCharacterPose, LANDING_FALL_SECONDS, LANDING_SECONDS } from '../../public/sparring-arena/src/character-landing.js';

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

it.each([crew, coach])('집은 인물은 머리 위 고정점을 중심으로 몸 전체가 흔들리고 내려놓으면 원래 자세로 돌아온다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const origin = new THREE.Vector3(3, 4, 2), scale = 0.7, yaw = 0.8;
  const pose = { scale, leftArm: 0.2, rightArm: 0.2 };
  models.draw(0, post, origin, 1, pose, yaw);
  const normal = snapshot(models, 0);
  models.draw(0, post, origin, 1, { ...pose, hanging: true }, yaw);
  const hanging = snapshot(models, 0);
  expect(hanging).not.toEqual(normal); // Relaxed ankles point down while suspended.
  const pivot = origin.clone().add(new THREE.Vector3(0, 2.08 * scale, 0));
  const matrix = new THREE.Matrix4(), partPosition = new THREE.Vector3();
  for (const angle of [-0.45, 0.45]) {
    models.draw(0, post, origin, 1, { ...pose, hanging: true, hangAngle: angle }, yaw);
    const swinging = snapshot(models, 0);
    const turn = new THREE.Matrix4().makeTranslation(...pivot.toArray())
      .multiply(new THREE.Matrix4().makeRotationZ(angle))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    expect(pivot.clone().applyMatrix4(turn).distanceTo(pivot)).toBeLessThan(1e-8);
    let lowerParts = 0;
    for (let part = 0; part < hanging.length; part++) {
      for (let offset = 0; offset < hanging[part].length; offset += 16) {
        matrix.fromArray(hanging[part], offset);
        if (Math.abs(matrix.determinant()) < 1e-8) {
          expect(swinging[part].slice(offset, offset + 16)).toEqual(hanging[part].slice(offset, offset + 16));
          continue;
        }
        const expected = matrix.clone().premultiply(turn).elements;
        expected.forEach((value, index) => expect(swinging[part][offset + index]).toBeCloseTo(value, 5));
        partPosition.setFromMatrixPosition(matrix);
        if (partPosition.y >= origin.y + 0.35 * scale) continue;
        const afterX = swinging[part][offset + 12];
        expect((afterX - partPosition.x) * Math.sign(angle)).toBeGreaterThan(0.2);
        lowerParts++;
      }
    }
    expect(lowerParts).toBeGreaterThan(0);
  }
  models.draw(0, post, origin, 1, pose, yaw);
  expect(snapshot(models, 0)).toEqual(normal);
});

it.each([crew, coach])('집기 보간의 시작은 호버 자세와 같고 끝은 기존 매달린 자세와 같다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const origin = new THREE.Vector3(1, 2, 3), yaw = .6;
  const pose = { scale: .7, crouch: .1, leftArm: -.4, rightArm: -.3 };
  models.draw(0, post, origin, 1, pose, yaw);
  const normal = snapshot(models, 0);
  const heldPose = { ...pose, hanging: true, hangAngle: .5, airRun: .8 };
  models.draw(0, post, origin, 1, { ...heldPose, hangBlend: 0 }, yaw);
  expect(snapshot(models, 0)).toEqual(normal);
  models.draw(0, post, origin, 1, { ...heldPose, hangBlend: .5 }, yaw);
  expect(snapshot(models, 0)).not.toEqual(normal);
  expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
  models.draw(0, post, origin, 1, heldPose, yaw);
  const hanging = snapshot(models, 0);
  models.draw(0, post, origin, 1, { ...heldPose, hangBlend: 1 }, yaw);
  expect(snapshot(models, 0)).toEqual(hanging);
  models.draw(0, post, origin, 1, pose, yaw);
  expect(snapshot(models, 0)).toEqual(normal);
});

it.each([crew, coach])('철푸덕 자세는 몸 전체를 낮게 눕히고 다시 일어나며 다른 인물에는 남지 않는다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const origin = new THREE.Vector3(0, -6.3, 10), yaw = .4;
  const frame = { position: origin, yaw, pose: { scale: .7 } };
  const held = { position: { x: 0, y: 2, z: 9 }, landing: origin, scale: 2, originalScale: .7, time: LANDING_FALL_SECONDS };
  models.draw(0, post, origin, 1, frame.pose, yaw);
  models.draw(1, post, origin, 1, frame.pose, yaw);
  const standing = snapshot(models, 0), other = snapshot(models, 1);
  const height = bounds(models, 0).getSize(new THREE.Vector3()).y;
  const splat = releasedCharacterPose(frame, held);
  models.draw(0, post, splat.position, 1, splat.pose, splat.yaw);
  const flat = bounds(models, 0);
  expect(flat.getSize(new THREE.Vector3()).y).toBeLessThan(height * .7);
  expect(flat.min.y).toBeGreaterThan(origin.y - .12);
  expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
  expect(snapshot(models, 1)).toEqual(other);
  const recovered = releasedCharacterPose(frame, { ...held, time: LANDING_SECONDS });
  models.draw(0, post, recovered.position, 1, recovered.pose, recovered.yaw);
  expect(snapshot(models, 0)).toEqual(standing);
});

it('주먹과 손가락질은 손 모양을 바꾸고 다음 캐릭터나 평소 자세에 남지 않는다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const origin = new THREE.Vector3();
  models.draw(0, crew, origin, 1, {});
  models.draw(1, crew, origin, 1, {});
  const resting = snapshot(models, 0), other = snapshot(models, 1);
  models.draw(0, crew, origin, 1, { rightGrip: 1 });
  const fist = snapshot(models, 0);
  expect(fist).not.toEqual(resting);
  models.draw(0, crew, origin, 1, { rightGrip: 1, rightPoint: 1 });
  expect(snapshot(models, 0)).not.toEqual(fist);
  expect(snapshot(models, 1)).toEqual(other);
  models.draw(0, crew, origin, 1, {});
  expect(snapshot(models, 0)).toEqual(resting);
});

it.each([crew, coach])('화난 표정은 눈썹 안쪽을 낮추고 평소 표정과 다른 인물에는 남지 않는다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const origin = new THREE.Vector3();
  models.draw(0, post, origin, 1, {});
  models.draw(1, post, origin, 1, {});
  const normal = snapshot(models, 0), other = snapshot(models, 1);
  const eyebrows = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 12
    && mesh.geometry.parameters.radius === .009);
  const readBrows = () => [0, 1].map(index => {
    const matrix = new THREE.Matrix4(); eyebrows.getMatrixAt(index, matrix); return matrix;
  });
  const relaxed = readBrows();
  models.draw(0, post, origin, 1, { anger: 1 });
  const angry = snapshot(models, 0);
  expect(angry).not.toEqual(normal);
  expect(snapshot(models, 1)).toEqual(other);
  for (const [index, brow] of readBrows().entries()) {
    const sign = Math.sign(brow.elements[12]);
    expect(Math.atan2(brow.elements[1], brow.elements[0]) * sign).toBeGreaterThan(.35);
    expect(brow.elements[13]).toBeLessThan(relaxed[index].elements[13]);
  }
  models.draw(0, post, origin, 1, { anger: 3 });
  expect(snapshot(models, 0)).toEqual(angry);
  models.draw(0, post, origin, 1, { anger: -1 });
  expect(snapshot(models, 0)).toEqual(normal);
  models.draw(0, post, origin, 1, { anger: .5 });
  expect(snapshot(models, 0)).not.toEqual(normal);
  expect(snapshot(models, 0)).not.toEqual(angry);
  models.draw(0, post, origin, 1, {});
  expect(snapshot(models, 0)).toEqual(normal);
});

it.each([crew, coach])('강한 짜증에는 눈을 좁히고 입을 벌리며 표정을 해제하면 원래 얼굴로 돌아온다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), origin = new THREE.Vector3();
  const face = models.pickMeshes.find(mesh => mesh.geometry.type === 'SphereGeometry' && mesh.material.color.getHex() === 0x24201e);
  const mouth = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 20
    && mesh.geometry.parameters.radius === .0065);
  const matrix = (mesh, index) => { const value = new THREE.Matrix4(); mesh.getMatrixAt(index, value); return value; };
  const faceParts = () => [0, 1, 2].map(index => matrix(face, index));
  models.draw(0, post, origin, 1, {});
  models.draw(1, post, origin, 1, {});
  const normal = snapshot(models, 0), other = snapshot(models, 1), normalParts = faceParts();
  expect(normalParts[2].determinant()).toBe(0);
  models.draw(0, post, origin, 1, { anger: 1 });
  expect(matrix(mouth, 0).elements[5]).toBeLessThan(0);
  for (const [index, eye] of faceParts().slice(0, 2).entries()) {
    expect(eye.elements[5]).toBeCloseTo(normalParts[index].elements[5] * .4);
  }
  models.draw(0, post, origin, 1, { anger: 1, mouthOpen: 1 });
  const shouting = faceParts()[2];
  expect(shouting.determinant()).toBeGreaterThan(0);
  expect(new THREE.Vector3().setFromMatrixScale(shouting).y).toBeGreaterThan(.07);
  expect(snapshot(models, 1)).toEqual(other);
  models.draw(0, post, origin, 1, {});
  expect(snapshot(models, 0)).toEqual(normal);
  models.draw(1, post, origin, 1, {});
  expect(snapshot(models, 1)).toEqual(other);
});

it.each([crew, coach])('놀란 표정은 눈과 눈썹을 올리고 작은 둥근 입을 만들며 다음 인물과 평소 얼굴에 남지 않는다: %j', post => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), origin = new THREE.Vector3();
  const face = models.pickMeshes.find(mesh => mesh.geometry.type === 'SphereGeometry' && mesh.material.color.getHex() === 0x24201e);
  const brows = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 12
    && mesh.geometry.parameters.radius === .009);
  const smile = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 20
    && mesh.geometry.parameters.radius === .0065);
  const matrix = (mesh, index) => { const value = new THREE.Matrix4(); mesh.getMatrixAt(index, value); return value; };
  const scale = (mesh, index) => new THREE.Vector3().setFromMatrixScale(matrix(mesh, index));
  models.draw(0, post, origin, 1, {});
  models.draw(1, post, origin, 1, {});
  const normal = snapshot(models, 0), other = snapshot(models, 1);
  const eyeScales = [0, 1].map(index => scale(face, index));
  const browHeights = [0, 1].map(index => matrix(brows, index).elements[13]);
  models.draw(0, post, origin, 1, { surprise: 1, mouthOpen: .6 });
  const surprised = snapshot(models, 0);
  for (const index of [0, 1]) {
    expect(scale(face, index).x).toBeCloseTo(eyeScales[index].x * 1.2);
    expect(scale(face, index).y).toBeCloseTo(eyeScales[index].y * 1.4);
    expect(matrix(brows, index).elements[13]).toBeGreaterThan(browHeights[index] + .04);
  }
  expect(matrix(smile, 0).determinant()).toBe(0);
  expect(matrix(face, 2).determinant()).toBeGreaterThan(0);
  const mouthScale = scale(face, 2);
  expect(Math.abs(mouthScale.x - mouthScale.y)).toBeLessThan(.005);
  expect(mouthScale.x).toBeLessThan(.05);
  expect(mouthScale.y).toBeLessThan(.05);
  expect(snapshot(models, 1)).toEqual(other);
  models.draw(0, post, origin, 1, { surprise: 3, mouthOpen: .6 });
  expect(snapshot(models, 0)).toEqual(surprised);
  models.draw(0, post, origin, 1, { surprise: -1 });
  expect(snapshot(models, 0)).toEqual(normal);
  models.draw(1, post, origin, 1, {});
  expect(snapshot(models, 1)).toEqual(other);
});

it('잡힌 달리기는 무릎을 번갈아 접고 양발을 앞뒤로 움직이며 바닥 자세에는 적용되지 않는다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const frame = { position: new THREE.Vector3(), pose: { hanging: true } };
  const legs = models.pickMeshes.find(mesh => mesh.geometry.hasAttribute('limbBend') && mesh.material.color.getHex() === 0x406387);
  const soles = models.pickMeshes.find(mesh => mesh.geometry.type === 'BoxGeometry' && mesh.material.color.getHex() === 0xdeddd9);
  const feet = () => [0, 1].map(index => {
    const matrix = new THREE.Matrix4(); soles.getMatrixAt(index, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  });
  const pose = heldReactionPose(frame, Math.PI / 40).pose;
  models.draw(0, crew, frame.position, 1, { ...pose, lean: 0, hangAngle: 0 });
  const bends = Array.from(legs.geometry.getAttribute('limbBend').array).slice(0, 2);
  const first = feet();
  expect(Math.max(...bends) - Math.min(...bends)).toBeGreaterThan(.9);
  models.draw(0, crew, frame.position, 1, { ...pose, lean: 0, hangAngle: 0, airRun: -pose.airRun });
  const nextBends = Array.from(legs.geometry.getAttribute('limbBend').array).slice(0, 2);
  expect(nextBends[0]).toBeCloseTo(bends[1]);
  expect(nextBends[1]).toBeCloseTo(bends[0]);
  const next = feet();
  expect((first[0].z - first[1].z) * (next[0].z - next[1].z)).toBeLessThan(0);
  expect(Math.abs(first[0].z - next[0].z)).toBeGreaterThan(.2);
  models.draw(0, crew, frame.position, 1, { hanging: false, airRun: 1 });
  const ground = snapshot(models, 0);
  models.draw(0, crew, frame.position, 1, { hanging: false, airRun: -1 });
  expect(snapshot(models, 0)).toEqual(ground);
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
