import * as THREE from 'three';
import { createMuzzleBurst } from '../../public/sparring-arena/src/muzzle-burst.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('발사 순간 입구에서 퍼지고 반동 후 파이프가 원위치로 돌아온다', () => {
  const pipe = new THREE.Group(), barrel = new THREE.Group();
  pipe.add(barrel);
  const burst = createMuzzleBurst(pipe, barrel, 2.35, 0x8ef5e8);
  const effect = pipe.children[1], ring = effect.children[0];
  expect(effect.visible).toBe(false);
  burst.fire();
  expect(effect.visible).toBe(true);
  expect(effect.position.z).toBeCloseTo(2.35 / 2 + 0.08);
  burst.step(0.064);
  expect(barrel.position.z).toBeCloseTo(-0.18);
  expect(ring.scale.x).toBeGreaterThan(1);
  expect(ring.position.z).toBeGreaterThan(0);
  burst.step(0.256);
  expect(barrel.position.z).toBeCloseTo(0);
  expect(effect.visible).toBe(false);
  burst.fire(); burst.step(0.064);
  expect(barrel.position.z).toBeCloseTo(-0.18);
  burst.step(0, true);
  expect(barrel.position.z).toBeCloseTo(0);
  expect(effect.visible).toBe(false);
});
