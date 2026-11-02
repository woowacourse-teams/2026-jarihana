import * as THREE from 'three';
import { createClashCamera } from '../../public/sparring-arena/src/clash-camera.js';
import { createArenaCamera, fitArenaCamera } from '../../public/sparring-arena/src/arena-framing.js';
import { TANK } from '../../public/sparring-arena/src/physics.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

function frame(elapsed = 0, overrides = {}) {
  const t = Math.min(1, elapsed / 0.78);
  return { id: 'my-reply', mine: true, fresh: true, side: 'a', elapsed, contactAt: 0.78, releaseAt: 1.8,
    follow: new THREE.Vector3(-8 + 7.42 * t, 3 - 3.2 * t, 0.3),
    opponent: new THREE.Vector3(8 - 7.42 * t, 3 - 3.2 * t, 0.3),
    impact: new THREE.Vector3(0, -0.2, 0.3), ...overrides };
}
function base(view, width = 1200, height = 700) {
  const camera = createArenaCamera(view);
  fitArenaCamera(camera, view, width, height, TANK);
  return camera;
}
const snapshot = camera => JSON.stringify({ position: camera.position, quaternion: camera.quaternion,
  zoom: camera.zoom, view: camera.view, projection: camera.projectionMatrix.elements });

it.each(['original', 'reference'])('%s 양쪽 호스를 추적할 때 기본 정면 방향을 유지하고 캡슐을 중앙에 둔다', view => {
  for (const side of ['a', 'b']) {
    const camera = base(view), cut = createClashCamera();
    const transport = elapsed => frame(elapsed, { side, phase: 'transport', follow: new THREE.Vector3(side === 'a' ? -9 : 9, elapsed * 6 - 4, 3 - elapsed * 2) });
    cut.setEnabled(true); cut.update(camera, transport(0), 0);
    for (const elapsed of [0.5, 0.8, 1.1]) {
      const item = transport(elapsed), shot = cut.update(camera, item, 0.3);
      expect(shot.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-6);
      const point = item.follow.clone().project(shot);
      expect(point.x).toBeCloseTo(0, 8);
      expect(point.y).toBeCloseTo(0, 8);
    }
    cut.update(camera, frame(0, { side }), 0);
    for (const elapsed of [0.2, 0.6, 0.8, 1.5]) {
      expect(cut.update(camera, frame(elapsed, { side }), 0.2).quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-6);
    }
  }
});

it('호스 추적은 초반에 즉시 확대하지 않고 여유 있게 접근한다', () => {
  const camera = base('reference'), cut = createClashCamera();
  const transport = elapsed => frame(elapsed, { phase: 'transport' });
  cut.setEnabled(true);
  expect(cut.update(camera, transport(0), 0)).toBe(camera);
  cut.update(camera, transport(0.15), 0.15);
  const early = cut.intensity();
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(0.5);
  cut.update(camera, transport(0.3), 0.15);
  expect(cut.intensity()).toBeGreaterThan(early);
  expect(cut.intensity()).toBeLessThan(1);
  cut.update(camera, transport(0.45), 0.15);
  expect(cut.intensity()).toBe(1);
});

it('같은 메시지를 호스에서 추적하다 발사와 충돌로 끊김 없이 이어간다', () => {
  const camera = base('reference'), before = snapshot(camera), cut = createClashCamera();
  const transport = elapsed => ({ ...frame(elapsed), phase: 'transport', follow: new THREE.Vector3(-9, -4 + elapsed * 7, 2) });
  cut.setEnabled(true); cut.update(camera, transport(0), 0);
  const pipe = cut.update(camera, transport(0.7), 0.7).clone();
  expect(pipe.position.distanceTo(camera.position)).toBeGreaterThan(5);
  const launch = cut.update(camera, frame(0), 0.05);
  expect(launch.position.distanceTo(pipe.position)).toBeLessThan(0.001);
  expect(cut.intensity()).toBe(1);
  expect(cut.update(camera, frame(0.7), 0.7)).not.toBe(camera);
  expect(cut.update(camera, frame(1.8), 1.1)).toBe(camera);
  expect(snapshot(camera)).toBe(before);
});

it.each(['original', 'reference'])('%s 구도를 수정하지 않고 캡슐을 추적한 후 동일한 카메라로 복귀한다', view => {
  const camera = base(view), before = snapshot(camera), cut = createClashCamera();
  cut.setEnabled(true); cut.update(camera, frame(), 0);
  const close = cut.update(camera, frame(0.4), 0.4);
  expect(close).not.toBe(camera);
  expect(close.position.distanceTo(camera.position)).toBeGreaterThan(5);
  expect(snapshot(camera)).toBe(before);
  const subject = frame(0.4).follow.project(close);
  expect(Math.abs(subject.x)).toBeLessThan(1);
  expect(Math.abs(subject.y)).toBeLessThan(1);
  expect(cut.timeScale(frame(0.6))).toBe(1);
  expect(cut.timeScale(frame(0.7))).toBe(0.65);
  expect(cut.timeScale(frame(0.8))).toBe(1);
  expect(cut.update(camera, frame(1.8), 1.4)).toBe(camera);
  expect(cut.intensity()).toBe(0);
  expect(snapshot(camera)).toBe(before);
});

it.each([{ mine: false }, { fresh: false }])('다른 사람이나 지난 대화는 카메라를 움직이지 않는다: %j', overrides => {
  const camera = base('reference'), cut = createClashCamera();
  cut.setEnabled(true);
  expect(cut.update(camera, frame(0, overrides), 0)).toBe(camera);
  expect(cut.update(camera, frame(0.5, overrides), 0.5)).toBe(camera);
});

it('기본은 꺼짐이며 중간에 끄거나 모션 감소가 켜지면 즉시 원래 구도로 돌아온다', () => {
  const camera = base('reference'), cut = createClashCamera();
  expect(cut.update(camera, frame(), 0)).toBe(camera);
  cut.setEnabled(true);
  cut.update(camera, frame(0, { id: 'second' }), 0);
  expect(cut.update(camera, frame(0.3, { id: 'second' }), 0.3)).not.toBe(camera);
  cut.setEnabled(false);
  expect(cut.update(camera, frame(0.4, { id: 'second' }), 0.1)).toBe(camera);
  cut.setEnabled(true);
  expect(cut.update(camera, frame(0.5, { id: 'second' }), 0.1)).toBe(camera);
  cut.update(camera, frame(0, { id: 'third' }), 0);
  expect(cut.update(camera, frame(0.3, { id: 'third' }), 0.3)).not.toBe(camera);
  expect(cut.update(camera, frame(0.4, { id: 'third' }), 0.1, true)).toBe(camera);
});

it('연속 받아치기를 모두 카메라 대기열에 쌓지 않고 복귀 후 잠시 전체 구도를 유지한다', () => {
  const camera = base('reference'), cut = createClashCamera();
  cut.setEnabled(true); cut.update(camera, frame(), 0);
  cut.update(camera, frame(1.8), 1.8);
  expect(cut.update(camera, frame(0, { id: 'second' }), 0.1)).toBe(camera);
  expect(cut.update(camera, frame(0.3, { id: 'second' }), 0.3)).toBe(camera);
  cut.update(camera, null, 3);
  cut.update(camera, frame(0, { id: 'third' }), 0);
  expect(cut.update(camera, frame(0.3, { id: 'third' }), 0.3)).not.toBe(camera);
});

it('모바일에서도 두 충돌 캡슐을 화면 안에 두고 화면 변경 후 최신 기본 구도로 복귀한다', () => {
  const camera = base('reference', 390, 500), cut = createClashCamera();
  cut.setEnabled(true); cut.update(camera, frame(), 0);
  const contact = frame(0.8), shot = cut.update(camera, contact, 0.8);
  for (const point of [contact.follow, contact.opponent]) {
    const p = point.clone().project(shot);
    expect(Math.abs(p.x)).toBeLessThan(0.85);
    expect(Math.abs(p.y)).toBeLessThan(0.85);
  }
  fitArenaCamera(camera, 'reference', 900, 700, TANK);
  expect(cut.update(camera, frame(1.8), 1)).toBe(camera);
});

it.each(['original', 'reference'])('%s 충돌 뒤 미끄럼틀이 끝날 때까지 서서히 빠지고 기존 구도를 복구한다', view => {
  const camera = base(view), before = snapshot(camera), cut = createClashCamera();
  cut.setEnabled(true); cut.update(camera, frame(), 0);
  const last = cut.update(camera, frame(1.75), 1.75).clone();
  const slide = elapsed => frame(elapsed, { phase: 'slide', follow: new THREE.Vector3(0, -4 - elapsed, 2 + elapsed * 3) });
  const start = cut.update(camera, slide(0), 0.05).clone();
  expect(start.position.distanceTo(last.position)).toBeLessThan(1e-8);
  expect(start.quaternion.angleTo(last.quaternion)).toBeLessThan(1e-6);
  let previousIntensity = cut.intensity();
  for (const elapsed of [0.3, 0.7, 1.1, 1.4, 1.7]) {
    expect(cut.update(camera, slide(elapsed), 0.3)).not.toBe(camera);
    expect(cut.intensity()).toBeLessThan(previousIntensity);
    expect(cut.intensity()).toBeGreaterThan(0);
    previousIntensity = cut.intensity();
  }
  expect(cut.update(camera, slide(1.8), 0.1)).toBe(camera);
  expect(snapshot(camera)).toBe(before);
});

it('미끄럼틀만 단독으로 재생할 때는 새 카메라 연출을 시작하지 않는다', () => {
  const camera = base('reference'), cut = createClashCamera();
  cut.setEnabled(true);
  expect(cut.update(camera, frame(0, { phase: 'slide' }), 0)).toBe(camera);
});
