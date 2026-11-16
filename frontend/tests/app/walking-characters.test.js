import * as THREE from 'three';
import { createWalkingCharacters } from '../../public/sparring-arena/src/walking-characters.js';
import { heldReactionPose } from '../../public/sparring-arena/src/held-reactions.js';
import { releasedCharacterPose, LANDING_FALL_SECONDS, LANDING_SECONDS } from '../../public/sparring-arena/src/character-landing.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

const crew = { memberType: 'CREW' }, coach = { memberType: 'COACH' };
function partMatrix(mesh, part, slot = 0) {
  const index = mesh.userData.avatarInstanceIds.indexOf(slot * mesh.userData.avatarStride + part);
  const matrix = new THREE.Matrix4().makeScale(0, 0, 0);
  if (index >= 0) mesh.getMatrixAt(index, matrix);
  return matrix;
}
function snapshot(models, slot) {
  return models.pickMeshes.map(mesh => Array.from({ length: mesh.userData.avatarStride }, (_, part) =>
    partMatrix(mesh, part, slot).toArray()).flat());
}
function bounds(models, slot) {
  const box = new THREE.Box3();
  for (const mesh of models.pickMeshes) {
    mesh.geometry.computeBoundingBox();
    for (let part = 0; part < mesh.userData.avatarStride; part++) {
      const matrix = partMatrix(mesh, part, slot);
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
    return partMatrix(eyebrows, index);
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
  models.draw(0, post, origin, 1, {});
  const face = models.pickMeshes.find(mesh => mesh.geometry.type === 'SphereGeometry' && hasInstanceColor(mesh, 0x24201e));
  const mouth = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 20
    && mesh.geometry.parameters.radius === .0065);
  const matrix = (mesh, index) => { return partMatrix(mesh, index); };
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
  models.draw(0, post, origin, 1, {});
  const face = models.pickMeshes.find(mesh => mesh.geometry.type === 'SphereGeometry' && hasInstanceColor(mesh, 0x24201e));
  const brows = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 12
    && mesh.geometry.parameters.radius === .009);
  const smile = models.pickMeshes.find(mesh => mesh.geometry.parameters?.tubularSegments === 20
    && mesh.geometry.parameters.radius === .0065);
  const matrix = (mesh, index) => { return partMatrix(mesh, index); };
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
  models.draw(0, crew, frame.position, 1, {});
  const legs = models.pickMeshes.find(mesh => mesh.geometry.hasAttribute('limbBend') && hasInstanceColor(mesh, 0x406387));
  const soles = models.pickMeshes.find(mesh => mesh.geometry.type === 'BoxGeometry' && hasInstanceColor(mesh, 0xdeddd9));
  const feet = () => [0, 1].map(index => {
    const matrix = partMatrix(soles, index);
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
  expect(models.pickMeshes.every(mesh => mesh.count <= mesh.instanceMatrix.count)).toBe(true);
  models.draw(0, coach, new THREE.Vector3(-2, 0, 0), 1, { stride: 1 });
  expect(snapshot(models, 1)).toEqual(other);
  models.hide(0);
  expect(bounds(models, 0).isEmpty()).toBe(true);
  expect(snapshot(models, 1)).toEqual(other);
  expect(bounds(models, 1).isEmpty()).toBe(false);
  models.hide(1);
  expect(models.pickMeshes.every(mesh => mesh.count === 0)).toBe(true);
  models.draw(0, crew, new THREE.Vector3(), 1, { stride: 0 });
  expect(models.pickMeshes.every(mesh => mesh.count <= mesh.instanceMatrix.count / 2)).toBe(true);
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
it('노트북은 덮개 뒷면이 바깥을 향하고 수평 바닥은 한 손 위를 따르며 반대 손을 움직이지 않는다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), original = AVATAR_PRESETS[0].appearance;
  const itemMatrix = (material, predicate = () => true) => {
    for (const mesh of models.pickMeshes.filter(mesh => mesh.userData.avatarMaterial === material)) {
      for (let index = 0; index < mesh.count; index++) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        if (Math.abs(matrix.determinant()) > 1e-8 && predicate(matrix)) return matrix;
      }
    }
    throw new Error(`Visible ${material} part is missing`);
  };
  try {
    for (const pose of [{}, { stride: 0.8 }, { seated: 1 }, { speaking: true, time: 1 },
      { rightArm: -0.6, rightElbow: -0.8, rightSpread: 0.2 }]) {
      const freeLeft = models.draw(0, { appearance: original }, new THREE.Vector3(), 1, pose).leftHand.clone();
      const hands = models.draw(0, { appearance: { ...original, handheld: 'laptop' } }, new THREE.Vector3(), 1, pose);
      expect(hands.leftHand.toArray()).toEqual(freeLeft.toArray());
      const base = itemMatrix('itemMetal', matrix => new THREE.Vector3().setFromMatrixScale(matrix).y < 0.02);
      const center = new THREE.Vector3().setFromMatrixPosition(base);
      expect(center.distanceTo(hands.rightHand)).toBeLessThan(0.15);
      expect(center.y).toBeGreaterThan(hands.rightHand.y);
      expect(new THREE.Vector3(0, 1, 0).transformDirection(base).y).toBeCloseTo(1, 5);
      const screen = itemMatrix('itemScreen');
      expect(new THREE.Vector3(0, 0, -1).transformDirection(screen).z).toBeLessThan(-0.9);
      expect(new THREE.Vector3().setFromMatrixPosition(screen).z).toBeGreaterThan(center.z + 0.1);
    }
  } finally { models.dispose(); }
});
it('가방·소지품 조합은 걷기·앉기에서도 유효하고 다른 슬롯에 번지지 않으며 벗으면 원래 모습으로 돌아온다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), original = AVATAR_PRESETS[0].appearance;
  try {
    models.draw(0, { appearance: original }, new THREE.Vector3(), 1, {});
    models.draw(1, { appearance: original }, new THREE.Vector3(2, 0, 0), 1, {});
    const before = snapshot(models, 0), other = snapshot(models, 1), otherColors = colorSnapshot(models, 1);
    for (const bag of ['backpack', 'crossbody', 'shoulder']) for (const handheld of ['hotCoffee', 'icedCoffee', 'book', 'laptop', 'phone']) {
      for (const pose of [{ stride: 0.8 }, { seated: 1 }, { speaking: true, time: 1 }]) {
        models.draw(0, { appearance: { ...original, bag, bagColor: 'coral', handheld } }, new THREE.Vector3(), 1, pose);
        expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
      }
      expect(snapshot(models, 1)).toEqual(other);
      expect(colorSnapshot(models, 1)).toEqual(otherColors);
    }
    const grip = { rightArm: -0.7, rightElbow: -0.4, rightSpread: 0.2 };
    const emptyHand = models.draw(0, { appearance: original }, new THREE.Vector3(), 1, grip).rightHand.clone();
    const carrying = models.draw(0, { appearance: { ...original, handheld: 'phone' } }, new THREE.Vector3(), 1, grip);
    expect(carrying.rightHand.toArray()).toEqual(emptyHand.toArray());
    models.draw(0, { appearance: original }, new THREE.Vector3(), 1, {});
    expect(snapshot(models, 0)).toEqual(before);
  } finally { models.dispose(); }
});
it('모자·선글라스를 모든 머리와 섞어도 다른 슬롯에 번지지 않고 벗으면 원래 외형으로 돌아온다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), original = AVATAR_PRESETS[0].appearance;
  try {
    models.draw(0, { appearance: original }, new THREE.Vector3(), 1, {});
    models.draw(1, { appearance: original }, new THREE.Vector3(2, 0, 0), 1, {});
    const before = snapshot(models, 0), beforeColors = colorSnapshot(models, 0);
    const other = snapshot(models, 1), otherColors = colorSnapshot(models, 1);
    const accessoryVisible = () => models.pickMeshes.filter(mesh => ['hat', 'hatTrim', 'lenses'].includes(mesh.userData.avatarMaterial))
      .some(mesh => {
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix); if (Math.abs(matrix.determinant()) > 1e-8) return true;
        }
        return false;
      });
    expect(accessoryVisible()).toBe(false);
    for (const hair of ['curly', 'parted', 'bob', 'long', 'flowing', 'bald']) {
      for (const hat of ['cap', 'bucket', 'beanie', 'beret']) {
        models.draw(0, { appearance: { ...original, hair, hat, hatColor: 'mint', glasses: 'sunglasses' } },
          new THREE.Vector3(), 1, { stride: 0.8, speaking: true, time: 1 });
        expect(accessoryVisible()).toBe(true);
        expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
        expect(snapshot(models, 1)).toEqual(other);
        expect(colorSnapshot(models, 1)).toEqual(otherColors);
      }
    }
    models.draw(0, { appearance: original }, new THREE.Vector3(), 1, {});
    expect(accessoryVisible()).toBe(false);
    expect(snapshot(models, 0)).toEqual(before);
    expect(colorSnapshot(models, 0)).toEqual(beforeColors);
  } finally { models.dispose(); }
});
it('신발 교체는 다른 파츠와 다른 사람의 외형을 유지하며 보행 중 바닥을 뚫지 않는다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2);
  const original = AVATAR_PRESETS[0].appearance;
  try {
    models.draw(0, { appearance: original }, new THREE.Vector3(), 1, {});
    models.draw(1, { appearance: original }, new THREE.Vector3(2, 0, 0), 1, {});
    const other = snapshot(models, 1), otherColors = colorSnapshot(models, 1);
    const body = () => snapshot(models, 0).filter((_, i) => !['footwear', 'sole'].includes(models.pickMeshes[i].userData.avatarMaterial));
    const before = body(), originalShoes = snapshot(models, 0);
    for (const shoes of ['slipOn', 'highTop', 'sneakers']) {
      models.draw(0, { appearance: { ...original, shoes, shoeColor: 'ink' } }, new THREE.Vector3(), 1, {});
      expect(body()).toEqual(before);
      if (shoes !== 'sneakers') expect(snapshot(models, 0)).not.toEqual(originalShoes);
      for (const stride of [-1, 0, 1]) {
        models.draw(0, { appearance: { ...original, shoes, shoeColor: 'ink' } }, new THREE.Vector3(), 1, { stride });
        expect(bounds(models, 0).min.y).toBeGreaterThanOrEqual(-0.005);
        expect(snapshot(models, 0).flat().every(Number.isFinite)).toBe(true);
      }
    }
    expect(snapshot(models, 1)).toEqual(other);
    expect(colorSnapshot(models, 1)).toEqual(otherColors);
    const legacy = { ...original }; delete legacy.shoes; delete legacy.shoeColor;
    models.draw(0, { appearance: legacy }, new THREE.Vector3(), 1, {});
    expect(snapshot(models, 0)).toEqual(originalShoes);
  } finally { models.dispose(); }
});
it('카드용 경량 조명에서도 선택한 파츠·색·관절 위치는 편집 미리보기와 같다', () => {
  const detailed = createWalkingCharacters(new THREE.Scene(), 2);
  const card = createWalkingCharacters(new THREE.Scene(), 2, { lightweight: true });
  try {
    const appearances = [...AVATAR_PRESETS.map(preset => preset.appearance),
      ...['sneakers', 'slipOn', 'highTop'].map(shoes => ({ ...AVATAR_PRESETS[0].appearance, shoes, shoeColor: 'coral' })),
      ...['cap', 'bucket', 'beanie', 'beret'].map(hat => ({ ...AVATAR_PRESETS[0].appearance, hat, hatColor: 'cream', glasses: 'sunglasses' })),
      ...['backpack', 'crossbody', 'shoulder'].map(bag => ({ ...AVATAR_PRESETS[0].appearance, bag, bagColor: 'navy' })),
      ...['hotCoffee', 'icedCoffee', 'book', 'laptop', 'phone'].map(handheld => ({ ...AVATAR_PRESETS[0].appearance, handheld }))];
    for (const appearance of appearances) {
      const post = { appearance };
      detailed.draw(0, post, new THREE.Vector3(), 1, { stride: 0.5 });
      card.draw(0, post, new THREE.Vector3(), 1, { stride: 0.5 });
      expect(snapshot(card, 0)).toEqual(snapshot(detailed, 0));
      expect(colorSnapshot(card, 0)).toEqual(colorSnapshot(detailed, 0));
    }
    expect(card.pickMeshes.every(mesh => mesh.material.isMeshLambertMaterial)).toBe(true);
  } finally { detailed.dispose(); card.dispose(); }
});
function colorSnapshot(models, slot) {
  return models.pickMeshes.map(mesh => Array.from({ length: mesh.userData.avatarStride }, (_, part) => {
    const index = mesh.userData.avatarInstanceIds.indexOf(slot * mesh.userData.avatarStride + part);
    if (index < 0) return [0, 0, 0];
    const color = new THREE.Color(); mesh.getColorAt(index, color); return color.toArray();
  }).flat());
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
  ['mouth', 'flat'], ['mouth', 'open'], ['eyes', 'dot'], ['eyes', 'slim'],
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

function hasInstanceColor(mesh, expected) {
  if (!mesh.instanceColor) return false;
  const color = new THREE.Color();
  mesh.getColorAt(0, color);
  return color.getHex() === expected;
}

it('미선택 소품은 그리기 범위에서 제외하고 제거·재사용 시 다른 인물의 파츠와 색을 보존한다', () => {
  const models = createWalkingCharacters(new THREE.Scene(), 2), origin = new THREE.Vector3();
  const appearance = AVATAR_PRESETS[0].appearance;
  try {
    models.draw(0, { appearance }, origin, 1, {});
    const count = () => models.pickMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const base = count();
    const equipment = models.pickMeshes.filter(mesh => /^(hat|bag|item)/.test(mesh.userData.avatarMaterial));
    expect(equipment.every(mesh => mesh.count === 0 && !mesh.visible)).toBe(true);
    const writes = equipment.map(mesh => jest.spyOn(mesh, 'setMatrixAt'));
    models.draw(0, { appearance }, origin, 1, { stride: 0.6 });
    writes.forEach(write => { expect(write).not.toHaveBeenCalled(); write.mockRestore(); });
    models.draw(0, { appearance }, origin, 1, {});
    models.draw(1, { appearance: { ...appearance, hat: 'bucket', bag: 'backpack', handheld: 'laptop' } }, origin, 1, {});
    const other = snapshot(models, 1), colors = colorSnapshot(models, 1), both = count();
    expect(both).toBeGreaterThan(base * 2);
    models.hide(0);
    expect(count()).toBe(both - base);
    expect(snapshot(models, 1)).toEqual(other);
    expect(colorSnapshot(models, 1)).toEqual(colors);
    models.draw(0, { appearance }, origin, 1, {});
    expect(count()).toBe(both);
    for (const mesh of models.pickMeshes) for (let index = 0; index < mesh.count; index++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
      expect(Math.abs(matrix.determinant())).toBeGreaterThan(0);
    }
    models.hide(1);
    expect(count()).toBe(base);
    expect(equipment.every(mesh => mesh.count === 0 && !mesh.visible)).toBe(true);
  } finally { models.dispose(); }
});
