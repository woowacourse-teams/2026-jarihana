import * as THREE from 'three';
import { createChairCharacters, createSeatedCapsuleCharacters } from '../../public/sparring-arena/src/chair-characters.js';
import { historyCheerPose } from '../../public/sparring-arena/src/history-cheer.js';
import { CHAIR_BRAWL_STYLES, UNARMED_BRAWL_STYLES, historyBrawlPose } from '../../public/sparring-arena/src/history-brawl.js';
import { historyWalkPose } from '../../public/sparring-arena/src/history-walk.js';
import { createArenaCamera, fitArenaCamera } from '../../public/sparring-arena/src/arena-framing.js';
import { TANK } from '../../public/sparring-arena/src/physics.js';

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

it('의자 응원은 머리 위 양손에 손잡이가 붙고 점프 응원의 의자는 바닥에 남는다', () => {
  const characters = createChairCharacters(world, 1);
  const resting = historyWalkPose({ origin: { x: 0, y: 0, z: 0 }, destination: { x: -3, y: 0, z: 9 }, elapsed: 3, side: 'a' });
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const render = (style, time) => {
    const frame = historyCheerPose(resting, { style, phase: 0, tempo: 1 }, time, 1, 'a');
    return characters.draw(0, post, new THREE.Vector3(frame.position.x, frame.position.y, frame.position.z), 1, frame.pose, frame.yaw);
  };
  const hands = render('chair', 0.4);
  const grip = new THREE.Vector3(0, 1.05, -0.3).applyMatrix4(matrixAt(chair, 0));
  expectPoint(grip, hands.leftHand.clone().add(hands.rightHand).multiplyScalar(0.5));
  expect(grip.y).toBeGreaterThan(1.5 * resting.pose.scale);
  chair.geometry.computeBoundingBox();
  expect(chair.geometry.boundingBox.clone().applyMatrix4(matrixAt(chair, 0)).max.y).toBeGreaterThan(2.1 * resting.pose.scale);
  render('jump', 0);
  const grounded = matrixAt(chair, 0);
  render('jump', Math.PI / 12);
  expectMatrix(matrixAt(chair, 0), grounded);
});

it.each(CHAIR_BRAWL_STYLES)('%s에서 손에 든 의자는 마당과 공중 모두 양손 중앙을 따라간다', style => {
  const characters = createChairCharacters(world, 1);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const resting = historyWalkPose({ origin: { x: 0, y: 0, z: 0 }, destination: { x: -3, y: 0, z: 9 }, elapsed: 3, side: 'a' });
  for (const hanging of [false, true]) for (const side of ['a', 'b']) for (const time of [0, 0.3, 0.6, 1]) {
    const frame = historyBrawlPose(resting, { style, phase: 0, tempo: 1 }, time, side);
    const hands = characters.draw(0, { ...post, side }, new THREE.Vector3(frame.position.x, frame.position.y, frame.position.z), 1,
      { ...frame.pose, hanging, hangAngle: 0.4 }, frame.yaw);
    if (frame.pose.chairFlight || frame.pose.chairVisible === false) continue;
    const grip = new THREE.Vector3(0, 1.05, -0.3).applyMatrix4(matrixAt(chair, 0));
    expectPoint(grip, hands.leftHand.clone().add(hands.rightHand).multiplyScalar(0.5));
  }
});

it.each(['left', 'right'])('%s 한손에 의자를 들면 반대손을 흔들어도 의자는 쥔 손에 고정된다', hand => {
  const group = new THREE.Group();
  group.position.set(3, -1, 2); group.rotation.set(.1, -.4, .2); group.scale.setScalar(1.2);
  world.add(group);
  const characters = createChairCharacters(group, 1);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const position = new THREE.Vector3(1, 4, 2);
  const pose = { scale: .7, seated: 0, chairLift: 1, chairHand: hand, chairPitch: -.2,
    leftArm: .25, rightArm: -2, leftElbow: -.35, rightElbow: -.6 };
  const freeArm = hand === 'left' ? 'rightArm' : 'leftArm';
  const grip = () => new THREE.Vector3(0, 1.05, -.3).applyMatrix4(matrixAt(chair, 0)).applyMatrix4(group.matrixWorld);
  for (const hanging of [false, true]) for (const chairCarry of [false, true]) {
    const draw = next => characters.draw(0, post, position, 1,
      { ...pose, hanging, hangAngle: .3, chairCarry, ...next }, .7);
    const hands = draw({});
    expectPoint(grip(), hands[hand + 'Hand']);
    const anchored = matrixAt(chair, 0);
    const waving = draw({ [freeArm]: 1 });
    expectPoint(grip(), waving[hand + 'Hand']);
    expectMatrix(matrixAt(chair, 0), anchored);
    const bothHands = draw({ chairHand: undefined });
    expectPoint(grip(), bothHands.leftHand.clone().add(bothHands.rightHand).multiplyScalar(.5));
  }
});

it.each([false, true])('의자를 던지면 손에서 떨어져 회전하며 날고 인물이 움직여도 궤적은 유지한다: hanging=%s', hanging => {
  const characters = createChairCharacters(world, 1);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const position = new THREE.Vector3(1, 0, 2);
  const pose = { scale: .7, seated: 0, chairVisible: true, chairLift: 1, chairPitch: -.8,
    leftArm: -1.8, rightArm: -1.8, leftElbow: -.3, rightElbow: -.3, hanging, hangAngle: .2 };
  const draw = (progress, location = position, yaw = .8) => characters.draw(0, post, location, 1,
    { ...pose, chairFlight: { progress } }, yaw);
  const hands = draw(0);
  const release = matrixAt(chair, 0);
  expectPoint(new THREE.Vector3(0, 1.05, -.3).applyMatrix4(release), hands.leftHand.clone().add(hands.rightHand).multiplyScalar(.5));
  draw(.5);
  const flight = matrixAt(chair, 0);
  const origin = new THREE.Vector3().setFromMatrixPosition(release), midway = new THREE.Vector3().setFromMatrixPosition(flight);
  expect(midway.x).toBeGreaterThan(origin.x + .4);
  expect(midway.z).toBeGreaterThan(origin.z + .4);
  expect(new THREE.Quaternion().setFromRotationMatrix(flight).angleTo(new THREE.Quaternion().setFromRotationMatrix(release))).toBeGreaterThan(1);
  draw(.5, new THREE.Vector3(8, 5, 9), -2);
  expectMatrix(matrixAt(chair, 0), flight);
  draw(.95);
  expect(new THREE.Vector3().setFromMatrixScale(matrixAt(chair, 0)).x).toBeLessThan(.35);
  draw(1);
  expect(chair.count).toBe(0);
  expect(characters.pickMeshes.some(mesh => mesh !== chair && mesh.count > 0)).toBe(true);
  characters.draw(0, post, position, 1, pose, .8);
  expectMatrix(matrixAt(chair, 0), release);
});

it('퇴장한 인물의 비행 상태를 새 인물에게 이어 붙이지 않는다', () => {
  const characters = createChairCharacters(world, 1);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const pose = { scale: 1, chairLift: 1, chairFlight: { progress: .3 } };
  characters.draw(0, post, new THREE.Vector3(), 1, pose);
  const old = new THREE.Vector3().setFromMatrixPosition(matrixAt(chair, 0));
  characters.hide(0);
  characters.draw(0, post, new THREE.Vector3(10, 0, 0), 1, pose);
  expect(new THREE.Vector3().setFromMatrixPosition(matrixAt(chair, 0)).x - old.x).toBeCloseTo(10);
});

it.each(['compact', 'original'])('%s 구도에서 던진 의자가 손을 떠나 화면 중앙으로 커지며 다가온 후 사라진다', view => {
  const camera = createArenaCamera(view);
  fitArenaCamera(camera, view, 900, 650, TANK);
  camera.updateMatrixWorld(true);
  const characters = createChairCharacters(world, 1);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const position = new THREE.Vector3(-2, -5, 10);
  const pose = { scale: 1.8, hanging: true, chairVisible: true, chairLift: 1, chairHand: 'left',
    leftArm: -1.8, leftElbow: -.3, chairPitch: -.8 };
  const draw = (progress, location = position) => characters.draw(0, post, location, 1,
    { ...pose, chairFlight: { target: 'camera', progress, camera } });
  const center = () => new THREE.Vector3(0, .55, 0).applyMatrix4(matrixAt(chair, 0)).project(camera);
  const projectedWidth = () => {
    const transform = matrixAt(chair, 0), vertices = chair.geometry.attributes.position;
    let min = Infinity, max = -Infinity;
    const point = new THREE.Vector3();
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(transform).project(camera);
      min = Math.min(min, point.x); max = Math.max(max, point.x);
    }
    return max - min;
  };
  const hands = draw(0);
  expectPoint(new THREE.Vector3(0, 1.05, -.3).applyMatrix4(matrixAt(chair, 0)), hands.leftHand);
  const releaseCenter = center(), releaseWidth = projectedWidth();
  draw(.7);
  const flight = matrixAt(chair, 0);
  draw(.7, new THREE.Vector3(9, 5, 3));
  expectMatrix(matrixAt(chair, 0), flight);
  draw(.98);
  expect(Math.hypot(center().x, center().y)).toBeLessThan(Math.hypot(releaseCenter.x, releaseCenter.y));
  expect(projectedWidth()).toBeGreaterThan(releaseWidth * 3);
  expect(projectedWidth()).toBeGreaterThan(1.5);
  draw(1);
  expect(chair.count).toBe(0);
  expect(characters.pickMeshes.some(mesh => mesh !== chair && mesh.count > 0)).toBe(true);
  characters.hide(0);
  draw(0);
  expect(projectedWidth()).toBeCloseTo(releaseWidth);
});

it.each(UNARMED_BRAWL_STYLES)('%s에서는 몸을 유지하고 의자만 숨겼다가 의자 동작으로 복구한다', style => {
  const characters = createChairCharacters(world, 1);
  const chair = characters.pickMeshes.find(mesh => mesh.name === 'sparring-chairs');
  const resting = historyWalkPose({ origin: { x: 0, y: 0, z: 0 }, destination: { x: -3, y: 0, z: 9 }, elapsed: 3, side: 'a' });
  const draw = action => {
    const frame = historyBrawlPose(resting, { style: action, phase: 0, tempo: 1 }, 0.3, 'a');
    characters.draw(0, post, new THREE.Vector3(frame.position.x, frame.position.y, frame.position.z), 1, frame.pose, frame.yaw);
  };
  draw('chair-slam'); expect(chair.count).toBeGreaterThan(0);
  draw(style); expect(chair.count).toBe(0);
  expect(characters.pickMeshes.some(mesh => mesh !== chair && mesh.count > 0)).toBe(true);
  draw('chair-shove'); expect(chair.count).toBeGreaterThan(0);
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
