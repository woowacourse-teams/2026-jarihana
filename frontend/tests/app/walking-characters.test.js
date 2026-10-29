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
