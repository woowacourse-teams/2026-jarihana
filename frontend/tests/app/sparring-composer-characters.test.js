import * as THREE from 'three';
import { createCapsuleBatch } from '../../public/sparring-arena/src/capsule-batch.js';
import { createWalkingCharacters } from '../../public/sparring-arena/src/walking-characters.js';
import { createComposerCharacters } from '../../public/sparring-arena/src/composer-characters.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: jest.fn() }));
jest.mock('../../public/sparring-arena/src/walking-characters.js', () => ({ createWalkingCharacters: jest.fn() }));
jest.mock('../../public/sparring-arena/src/characters.js', () => ({ createCharacters: jest.fn() }));

const pixel = (x, y, z) => new THREE.Vector3(x, -y, z);
const avatar = { x: 40, y: 100, width: 60, height: 80 };
const post = Object.freeze({ id: 'message-1', side: 'a', memberType: 'COACH' });
const route = () => ({ getTotalLength: () => 600, getPointAtLength: distance => ({ x: 80 + distance, y: 140 }) });
let standing, capsules, scene, models;

beforeEach(() => {
  jest.resetAllMocks();
  standing = { draw: jest.fn(), hide: jest.fn() };
  capsules = { draw: jest.fn(), hide: jest.fn() };
  createWalkingCharacters.mockReturnValue(standing);
  createCapsuleBatch.mockReturnValue(capsules);
  scene = new THREE.Scene();
  models = createComposerCharacters(scene, pixel);
  models.update([
    { side: 'a', avatar, diameter: 24, memberType: 'COACH', active: true },
    { side: 'b', avatar: { ...avatar, x: 800 }, diameter: 24, active: false },
  ]);
});

afterEach(() => models.dispose());

function ship(overrides = {}) {
  return models.ship({ post, route: route(), origin: avatar, diameter: 24, ...overrides });
}

it('새 인스턴스는 숨기고 양쪽 입력 슬롯에 실제 사용자 외형으로 선다', () => {
  expect(capsules.hide).toHaveBeenCalledTimes(24);
  expect(createCapsuleBatch).toHaveBeenCalledWith(scene.children[0], 24, createWalkingCharacters);
  const left = standing.draw.mock.calls.find(call => call[0] === 0);
  const right = standing.draw.mock.calls.find(call => call[0] === 1);
  expect(left[1]).toEqual({ side: 'a', memberType: 'COACH' });
  expect(right[1]).toEqual({ side: 'b', memberType: 'CREW' });
  expect(left[2]).toEqual(pixel(70, 180, 30));
  expect(left[3]).toBeCloseTo(80 / 2.1);
});

it('열린 캡슐 안으로 350ms 동안 작아지고 닫힌 뒤 다음 발언용 캐릭터가 돌아온다', () => {
  ship();
  let frame = capsules.draw.mock.lastCall;
  expect(frame[3]).toBe(1);
  expect(frame[1].post.memberType).toBe('COACH');
  expect(frame[2]).toBeGreaterThan(24 / 0.96);
  standing.draw.mockClear();
  models.step(0.175);
  expect(capsules.draw.mock.lastCall[3]).toBeCloseTo(0.5);
  expect(standing.draw.mock.calls.every(call => call[0] === 1)).toBe(true);
  standing.draw.mockClear();
  models.step(0.175);
  frame = capsules.draw.mock.lastCall;
  expect(frame[3]).toBe(0);
  expect(frame[2] * 0.96).toBeCloseTo(24);
  expect(frame[1].characterPose.scale).toBe(0.31);
  expect(standing.draw.mock.calls.some(call => call[0] === 0)).toBe(true);
  expect(models.needsFrame()).toBe(true);
});

it('발송 시 경로와 원점을 복사해 편 변경이나 레이아웃 변경에도 날아가던 캡슐이 튀지 않는다', () => {
  let offset = 0;
  const path = { getTotalLength: () => 600, getPointAtLength: distance => ({ x: 80 + distance + offset, y: 140 }) };
  const origin = { ...avatar };
  ship({ route: path, origin });
  offset = 1000; origin.x = 2000;
  models.update([{ side: 'a', avatar: origin, diameter: 100, memberType: 'CREW' }]);
  models.step(0.35);
  expect(capsules.draw.mock.lastCall[1].body.position.x).toBe(70);
  models.step(0.18);
  expect(capsules.draw.mock.lastCall[1].body.position.x).toBeCloseTo(80);
  expect(capsules.draw.mock.lastCall[1].body.position.z).toBeCloseTo(24 * (2.35 / 1.6) * 0.37);
  models.step(0.35);
  const frame = capsules.draw.mock.lastCall;
  expect(frame[1].body.position.x).toBeCloseTo(380);
  expect(frame[1].body.position.z).toBe(0);
  expect(frame[1].post).toEqual(post);
  expect(frame[1].post).not.toBe(post);
  expect(frame[2] * 0.96).toBeCloseTo(24);
});

it('포장과 흡입 후 경로 이동이 끝날 때만 도착을 한 번 알린다', () => {
  const onArrive = jest.fn();
  ship({ onArrive });
  models.step(1.22);
  expect(onArrive).not.toHaveBeenCalled();
  models.step(0.02);
  models.step(5);
  models.finishAll();
  expect(onArrive).toHaveBeenCalledTimes(1);
  expect(models.needsFrame()).toBe(false);
});

it('24개 동시 발송을 독립적으로 완료하고 취소한 캡슐은 도착하지 않는다', () => {
  const callbacks = Array.from({ length: 24 }, () => jest.fn());
  const cancels = callbacks.map((onArrive, index) => ship({ post: { ...post, id: index, side: index % 2 ? 'b' : 'a' }, onArrive }));
  cancels[5](); cancels[5]();
  models.step(2);
  callbacks.forEach((callback, index) => expect(callback).toHaveBeenCalledTimes(index === 5 ? 0 : 1));
});

it('감소된 모션은 대기 중인 발송을 즉시 한 번씩 완료한다', () => {
  const first = jest.fn(), second = jest.fn();
  ship({ onArrive: first }); ship({ onArrive: second });
  models.finishAll(); models.finishAll(); models.step(10);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(models.needsFrame()).toBe(false);
});

it('슬롯이 꽉 차면 가장 오래된 메시지를 먼저 도착시키고 새 발송을 잃지 않는다', () => {
  const callbacks = Array.from({ length: 25 }, () => jest.fn());
  callbacks.forEach(onArrive => ship({ onArrive }));
  expect(callbacks[0]).toHaveBeenCalledTimes(1);
  expect(callbacks[24]).not.toHaveBeenCalled();
  models.finishAll();
  callbacks.forEach(callback => expect(callback).toHaveBeenCalledTimes(1));
});

it('경로가 사라진 경우 전송을 대기 상태에 남겨두지 않는다', () => {
  const onArrive = jest.fn();
  ship({ route: null, onArrive });
  expect(onArrive).toHaveBeenCalledTimes(1);
  expect(models.needsFrame()).toBe(false);
});

it('해제는 도착 콜백 없이 자기 모델만 제거하고 공유한 리소스는 한 번 해제한다', () => {
  const external = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const externalGeometry = jest.spyOn(external.geometry, 'dispose');
  const externalMaterial = jest.spyOn(external.material, 'dispose');
  scene.add(external);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const ownedGeometry = jest.spyOn(geometry, 'dispose'), ownedMaterial = jest.spyOn(material, 'dispose');
  scene.children[0].add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const onArrive = jest.fn();
  ship({ onArrive });
  models.dispose(); models.dispose(); models.step(10); models.finishAll();
  ship({ onArrive });
  expect(onArrive).not.toHaveBeenCalled();
  expect(scene.children).toEqual([external]);
  expect(ownedGeometry).toHaveBeenCalledTimes(1);
  expect(ownedMaterial).toHaveBeenCalledTimes(1);
  expect(externalGeometry).not.toHaveBeenCalled();
  expect(externalMaterial).not.toHaveBeenCalled();
  expect(models.needsFrame()).toBe(false);
});

it('실제 캐릭터와 캡슐 배치가 포장·흡입·이동 전 구간에서 유효한 3D 행렬을 만든다', () => {
  models.dispose();
  createWalkingCharacters.mockImplementation(jest.requireActual('../../public/sparring-arena/src/walking-characters.js').createWalkingCharacters);
  createCapsuleBatch.mockImplementation(jest.requireActual('../../public/sparring-arena/src/capsule-batch.js').createCapsuleBatch);
  models = createComposerCharacters(scene, pixel);
  models.update([{ side: 'a', avatar, memberType: 'COACH', active: true }]);
  const onArrive = jest.fn();
  ship({ onArrive });
  for (const delta of [0, 0.175, 0.175, 0.18, 0.35, 0.36]) {
    models.step(delta);
    scene.traverse(object => {
      if (object.isInstancedMesh) expect(Array.from(object.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    });
  }
  expect(onArrive).toHaveBeenCalledTimes(1);
});
