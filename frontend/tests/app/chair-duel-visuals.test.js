import * as THREE from 'three';
import { createWalkingCharacters } from '../../public/sparring-arena/src/walking-characters.js';
import { createChairDuelVisuals } from '../../public/sparring-arena/src/chair-duel-visuals.js';
import { chairBattlePose } from '../../public/sparring-arena/src/chair-battle-motion.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });
jest.mock('../../public/sparring-arena/src/walking-characters.js', () => {
  const actual = jest.requireActual('../../public/sparring-arena/src/walking-characters.js');
  return { ...actual, createWalkingCharacters: jest.fn((...args) => {
    const characters = actual.createWalkingCharacters(...args);
    return { ...characters, draw: jest.fn(characters.draw) };
  }) };
});

const post = { side: 'b', memberType: 'COACH' };
let scene, stage, visuals, group, actors, viewportWidth;

function matrixAt(mesh, index) {
  const physicalIndex = mesh.userData.avatarInstanceIds?.indexOf(index) ?? index;
  const matrix = new THREE.Matrix4().makeScale(0, 0, 0);
  if (physicalIndex >= 0) mesh.getMatrixAt(physicalIndex, matrix);
  return matrix;
}

function expectPoint(actual, expected) {
  for (const axis of ['x', 'y', 'z']) expect(actual[axis]).toBeCloseTo(expected[axis], 4);
}

function frame(overrides = {}) {
  return { x: 150, y: 240, size: 210, scale: 0.8, motion: {
    phase: 'seated', seated: 1, yaw: -0.65, lean: 0,
    leftArm: -0.25, rightArm: -0.25, leftElbow: -0.85, rightElbow: -0.85,
    chair: { mode: 'seat', pitch: 0, roll: 0, x: 0, y: 0, scale: 1 },
  }, ...overrides };
}

function feet(value) {
  const bounds = stage.getBoundingClientRect();
  return new THREE.Vector3(bounds.left + value.x - document.documentElement.clientWidth / 2, innerHeight / 2 - bounds.top - value.y, 80);
}

beforeEach(() => {
  jest.clearAllMocks();
  viewportWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 960 });
  scene = new THREE.Scene();
  stage = document.createElement('div');
  stage.getBoundingClientRect = jest.fn(() => ({ left: 42, top: 35 }));
  visuals = createChairDuelVisuals(scene, stage);
  group = scene.getObjectByName('chair-duel');
  actors = createWalkingCharacters.mock.results.at(-1).value;
});
afterEach(() => {
  visuals.dispose();
  if (viewportWidth) Object.defineProperty(document.documentElement, 'clientWidth', viewportWidth);
  else delete document.documentElement.clientWidth;
  jest.restoreAllMocks();
});

it('화면 좌표와 등장 배율을 몸과 앉은 의자에 똑같이 적용하고 레이아웃 이동을 따라간다', () => {
  const value = frame(), chair = group.getObjectByName('sparring-chairs');
  let originalBounds;
  expect(group.visible).toBe(false);
  for (const bounds of [{ left: 42, top: 35 }, { left: 90, top: 70 }]) {
    stage.getBoundingClientRect.mockReturnValue(bounds);
    const obstacle = visuals.draw(0, post, value);
    const position = new THREE.Vector3(), scale = new THREE.Vector3();
    matrixAt(chair, 0).decompose(position, new THREE.Quaternion(), scale);
    expectPoint(position, feet(value));
    expectPoint(actors.draw.mock.lastCall[2], feet(value));
    expect(actors.draw.mock.lastCall[3]).toBeCloseTo(80);
    expectPoint(scale, new THREE.Vector3(80, 80, 80));
    expect(group.visible).toBe(true);
    expect(obstacle.left).toBeLessThan(value.x);
    expect(obstacle.right).toBeGreaterThan(value.x);
    expect(obstacle.top).toBeLessThan(value.y);
    expect(obstacle.bottom).toBeCloseTo(value.y, 3);
    if (originalBounds) {
      for (const edge of ['left', 'right', 'top', 'bottom']) expect(obstacle[edge]).toBeCloseTo(originalBounds[edge], 3);
    }
    originalBounds = obstacle;
  }
});

it.each(['thrust', 'slam'])('%s 자세에서도 의자 손잡이가 실제 양손의 중앙에 붙는다', phase => {
  const value = frame();
  value.motion = { ...value.motion, phase, seated: 0, lean: 0.15,
    leftArm: phase === 'slam' ? -3 : -1.6, rightArm: phase === 'slam' ? -3 : -1.6,
    leftElbow: -0.2, rightElbow: -0.2,
    chair: { ...value.motion.chair, mode: 'held', pitch: phase === 'slam' ? -Math.PI : -Math.PI / 2 },
  };
  visuals.draw(0, post, value);
  scene.updateMatrixWorld(true);
  const chair = group.getObjectByName('sparring-chairs');
  const grip = new THREE.Vector3(0, 1.05, -0.3).applyMatrix4(matrixAt(chair, 0)).applyMatrix4(chair.matrixWorld);
  const hands = actors.draw.mock.results.at(-1).value;
  expectPoint(grip, hands.leftHand.clone().add(hands.rightHand).multiplyScalar(0.5));
});

it('던진 의자는 손에서 떨어져 발 기준 화면 좌표와 배율로 날아간다', () => {
  const value = frame({ scale: 0.6 });
  value.motion = { ...value.motion, phase: 'throw', seated: 0,
    chair: { ...value.motion.chair, mode: 'flight', x: 120, y: -75, pitch: -0.5, roll: 1.2 },
  };
  visuals.draw(1, post, value);
  const chair = group.getObjectByName('sparring-chairs');
  const grip = new THREE.Vector3(0, 1.05, -0.3).applyMatrix4(matrixAt(chair, 1));
  expectPoint(grip, feet(value).add(new THREE.Vector3(72, 45, 0)));
});

it('대결이 끝난 옆으로 누운 의자는 캐릭터 발 높이에 내려앉는다', () => {
  for (const size of [132, 180, 210]) for (const index of [0, 1]) {
    const value = frame({ size, scale: 1, motion: chairBattlePose({ time: 8, index, size }) });
    const bounds = visuals.draw(index, post, value);
    expect(Math.abs(bounds.bottom - value.y)).toBeLessThan(size * 0.02);
    expect(actors.draw.mock.lastCall[4]).toMatchObject({ seated: 0, phase: 'settled' });
  }
});

it('한쪽을 숨겨도 다른 인물과 의자를 유지하고 모두 숨기면 대치 그룹을 감춘다', () => {
  visuals.draw(0, post, frame());
  visuals.draw(1, post, frame({ x: 400 }));
  const meshes = group.children.filter(object => object.isInstancedMesh);
  const otherSlot = meshes.map(mesh => {
    const stride = mesh.instanceMatrix.count / 2;
    return Array.from({ length: stride }, (_, part) => matrixAt(mesh, stride + part).elements);
  });
  visuals.hide(0);
  expect(group.visible).toBe(true);
  meshes.forEach((mesh, index) => {
    const stride = mesh.instanceMatrix.count / 2;
    for (let part = 0; part < stride; part++) {
      expect(matrixAt(mesh, part).determinant()).toBe(0);
      expect(matrixAt(mesh, stride + part).elements).toEqual(otherSlot[index][part]);
    }
  });
  visuals.hide(1);
  expect(group.visible).toBe(false);
  expect(meshes.every(mesh => mesh.count === 0)).toBe(true);
});

it('자기 인물·의자의 모든 메시와 재질을 한 번만 정리하고 다른 장면 물체는 보존한다', () => {
  const unrelated = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(unrelated);
  const unrelatedDisposals = [unrelated.geometry, unrelated.material].map(value => jest.spyOn(value, 'dispose'));
  visuals.draw(0, post, frame());
  const resources = new Set();
  group.traverse(object => {
    if (object.isInstancedMesh) resources.add(object);
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean)) resources.add(material);
  });
  const disposals = [...resources].map(value => jest.spyOn(value, 'dispose'));
  expect(disposals.length).toBeGreaterThan(3);
  visuals.dispose(); visuals.dispose();
  expect(scene.children).toEqual([unrelated]);
  disposals.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
  unrelatedDisposals.forEach(dispose => expect(dispose).not.toHaveBeenCalled());
  actors.draw.mockClear();
  visuals.draw(0, post, frame());
  expect(actors.draw).not.toHaveBeenCalled();
  expect(scene.children).toEqual([unrelated]);
  unrelated.geometry.dispose(); unrelated.material.dispose();
});
