import * as THREE from 'three';
import { createCapsuleReveals } from '../../public/sparring-arena/src/capsule-reveals.js';
import { createArenaCamera, fitArenaCamera } from '../../public/sparring-arena/src/arena-framing.js';
import { TANK } from '../../public/sparring-arena/src/physics.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it.each(['original', 'reference'])('%s 구도에서 충돌 지점에 별빛을 표시하고 애니메이션 후 제거한다', view => {
  const scene = document.createElement('div');
  Object.defineProperties(scene, { clientWidth: { value: 1200 }, clientHeight: { value: 700 } });
  const camera = createArenaCamera(view);
  fitArenaCamera(camera, view, 1200, 700, TANK);
  const reveals = createCapsuleReveals(scene, jest.fn());
  const position = new THREE.Vector3(0.2, -0.2, 0.3);
  reveals.spark(position, camera);
  const spark = scene.querySelector('.pipe-spark');
  const expected = position.clone().project(camera);
  expect(parseFloat(spark.style.left)).toBeCloseTo((expected.x + 1) * 600);
  expect(parseFloat(spark.style.top)).toBeCloseTo((1 - expected.y) * 350);
  expect(spark).toHaveTextContent('✦');
  expect(spark).toHaveAttribute('aria-hidden', 'true');
  spark.dispatchEvent(new Event('animationend'));
  expect(scene.querySelector('.pipe-spark')).toBeNull();
  reveals.dispose();
  expect(scene.childElementCount).toBe(0);
});
