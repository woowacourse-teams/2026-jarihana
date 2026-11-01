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
