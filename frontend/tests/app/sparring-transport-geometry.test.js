import * as THREE from 'three';
import { createTransportGeometry } from '../../public/sparring-arena/src/transport-geometry.js';
import { createArenaCamera, fitArenaCamera } from '../../public/sparring-arena/src/arena-framing.js';
import { TANK, nozzlePose } from '../../public/sparring-arena/src/physics.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it.each(['a', 'b'])('호스 %s 끝의 위치와 접선이 통 발사구의 실제 3D 축과 일치한다', side => {
  const camera = createArenaCamera('reference');
  fitArenaCamera(camera, 'reference', 1200, 700, TANK);
  const pose = nozzlePose(side, 'reference');
  const direction = new THREE.Vector3(...pose.direction).normalize();
  const rear = new THREE.Vector3(...pose.mouth).addScaledVector(direction, -2.35);
  const geometry = createTransportGeometry({ side, diameter: 50, inlet: { x: side === 'a' ? 230 : 970, y: 650 },
    outlet: { rear: rear.toArray(), mouth: pose.mouth, direction: direction.toArray() } }, camera,
  { left: 0, top: 0, width: 1200, height: 700 }, 1200);
  expect(geometry.hose.getPoint(1).distanceTo(rear)).toBeLessThan(1e-6);
  expect(geometry.hose.getTangent(1).dot(direction)).toBeGreaterThan(0.999);
  expect(geometry.hose.getTangent(0).dot(geometry.inletDirection.clone().negate())).toBeGreaterThan(0.999);
  const segments = geometry.hose.curves.map(curve => curve.getLength());
  for (const anchor of [segments[0] + segments[1] / 2, segments[0] + segments[1] + segments[2] + segments[3] / 2]) {
    const interval = (anchor + geometry.ringOffset) / geometry.ringSpacing;
    expect(interval).toBeCloseTo(Math.round(interval), 8);
  }
  expect(geometry.ringStart).toBeCloseTo(segments[0] + segments[1] / 2);
  expect(geometry.hose.curves[0]).toBeInstanceOf(THREE.LineCurve3);
  const intakeStart = geometry.inletRear.clone().project(camera);
  const intakeEnd = geometry.hose.curves[0].getPoint(1).project(camera);
  expect(intakeStart.y).toBeCloseTo(intakeEnd.y, 8);
  for (let i = 1; i < geometry.hose.curves.length; i++) {
    const previous = geometry.hose.curves[i - 1], next = geometry.hose.curves[i];
    expect(previous.getPoint(1).distanceTo(next.getPoint(0))).toBeLessThan(1e-6);
    expect(previous.getTangent(1).dot(next.getTangent(0))).toBeGreaterThan(.999);
  }
  expect(geometry.ringSpacing).toBeGreaterThan(3.5);
  const length = geometry.route.getTotalLength();
  const start = geometry.route.getPointAtLength(0), end = geometry.route.getPointAtLength(length);
  expect(start.x).toBeCloseTo(side === 'a' ? 230 : 970);
  expect(start.y).toBeCloseTo(650);
  expect(end.scale).toBeLessThan(0.72);
  expect(end.scale).toBeGreaterThan(0.6);
  const mouth = new THREE.Vector3(...pose.mouth).project(camera);
  expect(end.x).toBeCloseTo((mouth.x + 1) * 600);
  expect(end.y).toBeCloseTo((1 - mouth.y) * 350);
  expect(geometry.route.hiddenAfter).toBeLessThan(1);
});
