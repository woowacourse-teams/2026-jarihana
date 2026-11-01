import { createDispenserPhysics, TRAY } from '../../public/sparring-arena/src/dispenser-physics.js';
import { RADIUS } from '../../public/sparring-arena/src/physics.js';
import * as THREE from 'three';
import { createCapsuleBatch } from '../../public/sparring-arena/src/capsule-batch.js';
import { characterPose } from '../../public/sparring-arena/src/character-motion.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });
jest.mock('../../public/sparring-arena/src/characters.js', () => ({ createCharacters: jest.fn() }));

it.each([4.4, 10, 14])('마당 폭 %s에서 깨진 두 조각은 사라지기 전에 양옆 밖으로 빠져나간다', width => {
  const physics = createDispenserPhysics();
  physics.setTrayWidth(width);
  const body = physics.reset(0);
  body.position.set(0, TRAY.frontY + RADIUS + 0.2, 9.5);
  body.quaternion.setFromEuler(0.4, 0.8, 1.2);
  body.velocity.set(0, -1, 0);
  const parts = physics.breakApart(0);
  expect(parts.top.velocity.x * parts.bottom.velocity.x).toBeLessThan(0);
  for (let step = 0; step < 108; step++) physics.step(1 / 120);
  for (const part of Object.values(parts)) expect(Math.abs(part.position.x)).toBeGreaterThan(width / 2 + RADIUS);
  physics.release(0);
});

it('껍데기와 캐릭터가 회전을 공유하고 열릴 때 함께 바로 선다', () => {
  const frames = [];
  const characters = { draw: (...args) => frames.push({ rotation: args[6].clone(), yaw: args[5] }), hide: jest.fn() };
  const batch = createCapsuleBatch(new THREE.Scene(), 1, () => characters);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.8, 1.2));
  const entry = { post: { id: 'one', side: 'a' }, body: { position: new THREE.Vector3(), quaternion: rotation }, characterYaw: 0.2 };
  for (const opening of [0, 0.5, 1]) batch.draw(0, entry, 1, opening);
  expect(frames[0].rotation.angleTo(rotation)).toBeCloseTo(0);
  expect(frames[1].rotation.angleTo(rotation.clone().slerp(new THREE.Quaternion(), 0.5))).toBeCloseTo(0);
  expect(frames[2].rotation.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
  expect(frames.every(frame => frame.yaw === 0.2)).toBe(true);
  expect(entry.body.quaternion.equals(rotation)).toBe(true);
  batch.draw(0, { ...entry, phase: 'open' }, 1, 1);
  expect(characters.hide).toHaveBeenCalledWith(0);
  expect(frames).toHaveLength(3);
});

it('이동 중에는 웅크리고, 열린 뒤에는 일어나는 자세로 전환한다', () => {
  expect(characterPose({ phase: 'rolling' }).crouch).toBe(0.9);
  expect(characterPose({ phase: 'open', elapsed: 1 }).stage).toBe('speaking');
  expect(characterPose({ phase: 'open', elapsed: 1 }).crouch ?? 0).toBe(0);
});


it.each([[0.4, 0.8, 1.2], [Math.PI, 0, 0], [0, 0, Math.PI / 2]])('굴러오던 회전 %j에서 껍데기를 분리해도 두 반구가 재정렬되거나 순간 이동하지 않는다', (x, y, z) => {
  const physics = createDispenserPhysics();
  const body = physics.reset(0);
  body.position.set(0.3, -5, 7);
  body.quaternion.setFromEuler(x, y, z);
  body.angularVelocity.set(3, 2, 1);
  const rotation = body.quaternion.clone();
  const scene = new THREE.Scene();
  const batch = createCapsuleBatch(scene, 1, () => ({ draw() {}, hide() {} }));
  const entry = { post: { id: 'one', side: 'a' }, body, phase: 'rolling' };
  batch.draw(0, entry, RADIUS / 0.48);
  const meshes = scene.children.filter(mesh => mesh.isInstancedMesh);
  const before = meshes.map(mesh => { const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix); return matrix; });
  const parts = physics.breakApart(0);
  for (const part of Object.values(parts)) {
    expect(part.quaternion).toEqual(rotation);
    expect(part.angularVelocity.length()).toBeGreaterThan(0);
  }
  batch.draw(0, { ...entry, phase: 'open', body: parts.bottom, parts,
    characterPose: { shrink: 1, closing: 0 } }, RADIUS / 0.48);
  meshes.forEach((mesh, index) => {
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
    matrix.elements.forEach((value, element) => expect(value).toBeCloseTo(before[index].elements[element], 6));
  });
  const topPosition = parts.top.position.clone(), bottomPosition = parts.bottom.position.clone();
  physics.step(1 / 120);
  expect(parts.top.position.distanceTo(topPosition)).toBeGreaterThan(0);
  expect(parts.bottom.position.distanceTo(bottomPosition)).toBeGreaterThan(0);
  expect(physics.breakApart(0)).toBe(parts);
  physics.release(0);
});
