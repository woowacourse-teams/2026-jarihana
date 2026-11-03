import * as THREE from 'three';
import { createChairCharacters, createSeatedCapsuleCharacters } from '../../public/sparring-arena/src/chair-characters.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

const post = { side: 'a', memberType: 'CREW' };
let world;

function matrixAt(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

function expectMatrix(actual, expected) {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 5));
}

function expectPoint(actual, expected) {
  for (const axis of ['x', 'y', 'z']) expect(actual[axis]).toBeCloseTo(expected[axis], 5);
}

beforeEach(() => { world = new THREE.Scene(); });
afterEach(() => {
  const geometries = new Set(), materials = new Set();
  world.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean)) materials.add(material);
    if (object.isInstancedMesh) object.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
});

it('캡슐이 구르면 착석한 몸과 의자가 같은 중심과 회전으로 함께 움직인다', () => {
  const characters = createSeatedCapsuleCharacters(world, 2);
  const position = new THREE.Vector3(2, 3, -1), size = 1.4;
  const pose = { scale: 0.7, shrink: 0.8, lift: 0.18, stride: 1, crouch: 0.9 };
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, -0.7, 1.1));
  characters.draw(0, post, position, size, pose, 0.6);
  characters.draw(1, post, position, size, pose, 0.6, rotation);
  const aroundCapsule = new THREE.Matrix4().makeTranslation(position.x, position.y, position.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z));
  expect(characters.pickMeshes.some(mesh => mesh.name === 'sparring-chairs')).toBe(true);
  expect(characters.pickMeshes.length).toBeGreaterThan(1);
  for (const mesh of characters.pickMeshes) {
    const stride = mesh.instanceMatrix.count / 2;
    for (let part = 0; part < stride; part++) {
      const original = matrixAt(mesh, part), rotated = matrixAt(mesh, stride + part);
      if (original.determinant() === 0) expect(rotated.elements).toEqual(original.elements);
      else expectMatrix(rotated, aroundCapsule.clone().multiply(original));
    }
  }
});

it('의자를 들고 걸을 때 변환된 부모 장면에서도 손잡이를 양손의 중앙에 둔다', () => {
  const group = new THREE.Group();
  group.position.set(4, -2, 3);
  group.rotation.set(0.2, -0.35, 0.1);
  group.scale.setScalar(1.3);
  world.add(group);
  const characters = createChairCharacters(group, 1);
  const hands = characters.draw(0, post, new THREE.Vector3(2, 0.5, -1), 1.2,
    { chairCarry: true, seated: 0, scale: 0.7, shrink: 0.9, lean: 0.2, stride: 0.6 }, -0.5);
  world.updateMatrixWorld(true);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const grip = new THREE.Vector3(0, 1.05, -0.3).applyMatrix4(matrixAt(chair, 0)).applyMatrix4(chair.matrixWorld);
  const betweenHands = hands.leftHand.clone().add(hands.rightHand).multiplyScalar(0.5);
  expectPoint(grip, betweenHands);
});

it('한 슬롯을 숨겨도 다른 슬롯의 몸과 의자 행렬을 보존하고 마지막 슬롯만 숨기면 비운다', () => {
  const characters = createChairCharacters(world, 2);
  characters.draw(0, post, new THREE.Vector3(-2, 0, 0), 1, { seated: 1 });
  characters.draw(1, post, new THREE.Vector3(2, 0, 0), 1, { seated: 1 }, -0.4);
  const otherSlot = characters.pickMeshes.map(mesh => {
    const stride = mesh.instanceMatrix.count / 2;
    return Array.from({ length: stride }, (_, part) => matrixAt(mesh, stride + part).elements);
  });
  characters.hide(0);
  characters.pickMeshes.forEach((mesh, index) => {
    const stride = mesh.instanceMatrix.count / 2;
    expect(mesh.count).toBe(stride * 2);
    for (let part = 0; part < stride; part++) {
      expect(matrixAt(mesh, part).determinant()).toBe(0);
      expect(matrixAt(mesh, stride + part).elements).toEqual(otherSlot[index][part]);
    }
  });
  characters.hide(1);
  expect(characters.pickMeshes.every(mesh => mesh.count === 0)).toBe(true);
});
