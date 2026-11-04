import * as THREE from 'three';
import { createSparringChairs } from '../../public/sparring-arena/src/sparring-chairs.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

function matrixAt(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

it('브랜드 의자는 낮고 넓은 등받이와 작은 가로 구멍을 갖추고 기존 좌판 높이를 유지한다', () => {
  const scene = new THREE.Scene(), chairs = createSparringChairs(scene, 2);
  const [mesh] = chairs.pickMeshes;
  chairs.draw(0, new THREE.Vector3());
  scene.updateMatrixWorld(true);
  const bounds = mesh.geometry.boundingBox;
  expect(bounds.min.y).toBeCloseTo(0, 5);
  expect(bounds.max.y).toBeCloseTo(1.16, 3);
  expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(0.94, 3);
  expect(bounds.getSize(new THREE.Vector3()).z).toBeGreaterThanOrEqual(0.78);
  expect(bounds.getSize(new THREE.Vector3()).z).toBeLessThan(0.82);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.71, 2), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  ray.ray.origin.x = 0.34;
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  for (const x of [-0.2, 0, 0.2]) {
    const seatRay = new THREE.Raycaster(new THREE.Vector3(x, 0.6, 0.15), new THREE.Vector3(0, -1, 0));
    expect(seatRay.intersectObject(mesh)[0].point.y).toBeCloseTo(0.5, 3);
  }
  chairs.dispose();
});

it('등받이 곡면의 같은 위치는 동일한 단위 법선을 사용해 베벨 경계에 음영이 끊기지 않는다', () => {
  const chairs = createSparringChairs(new THREE.Scene(), 1);
  const { position, normal } = chairs.pickMeshes[0].geometry.attributes;
  const sharedNormals = new Map();
  let sharedVertices = 0;
  for (let index = 0; index < position.count; index++) {
    if (position.getY(index) <= 0.54) continue;
    const vertex = new THREE.Vector3().fromBufferAttribute(position, index);
    const direction = new THREE.Vector3().fromBufferAttribute(normal, index);
    expect(direction.length()).toBeCloseTo(1, 5);
    const key = vertex.toArray().join(',');
    if (sharedNormals.has(key)) {
      expect(direction.distanceTo(sharedNormals.get(key))).toBeLessThan(1e-6);
      sharedVertices++;
    } else sharedNormals.set(key, direction);
  }
  expect(sharedVertices).toBeGreaterThan(100);
  chairs.dispose();
});

it('등받이 전체 면을 짧은 삼각형으로 나눠 구부려도 큰 평면 조각이 생기지 않는다', () => {
  const chairs = createSparringChairs(new THREE.Scene(), 1);
  const positions = chairs.pickMeshes[0].geometry.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let shellTriangles = 0;
  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index);
    b.fromBufferAttribute(positions, index + 1);
    c.fromBufferAttribute(positions, index + 2);
    if (Math.min(a.y, b.y, c.y) <= 0.54) continue;
    expect(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))).toBeLessThan(0.085);
    shellTriangles++;
  }
  expect(shellTriangles).toBeGreaterThan(1000);
  expect(positions.count / 3).toBeLessThan(60000);
  chairs.dispose();
});

it('등받이 넓은 면의 법선은 삼각형 배치와 무관하게 연속 곡면의 기울기를 따른다', () => {
  const chairs = createSparringChairs(new THREE.Scene(), 1);
  const { position, normal } = chairs.pickMeshes[0].geometry.attributes;
  let capVertices = 0;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index);
    if (y <= 0.8) continue;
    const originalZ = position.getZ(index) - 0.025 * (x / 0.45) ** 2;
    if (Math.min(Math.abs(originalZ + 0.405), Math.abs(originalZ + 0.145)) > 1e-6) continue;
    expect(normal.getY(index)).toBeCloseTo(0, 5);
    expect(normal.getX(index) / normal.getZ(index)).toBeCloseTo(-0.05 * x / 0.45 ** 2, 5);
    capVertices++;
  }
  expect(capVertices).toBeGreaterThan(100);
  chairs.dispose();
});

it('하나의 인스턴스 메시로 의자마다 이동·회전·숨김을 독립적으로 적용한다', () => {
  const chairs = createSparringChairs(new THREE.Scene(), 3);
  const [mesh] = chairs.pickMeshes;
  const geometry = mesh.geometry, material = mesh.material;
  expect(chairs.pickMeshes).toHaveLength(1);
  expect(mesh.count).toBe(0);
  chairs.draw(0, { x: -2, y: 0, z: 0 }, 1, { y: 0.4 }, 'a');
  chairs.draw(2, { x: 2, y: 1, z: 0 }, 0.8, { x: 0.2, y: -0.4, z: 1.2 }, 'b');
  expect(mesh.count).toBe(3);
  const other = matrixAt(mesh, 2).elements;
  chairs.draw(0, { x: 0, y: 3, z: 1 }, 0.6, { x: 1, y: 2, z: 3 });
  expect(matrixAt(mesh, 0).elements.every(Number.isFinite)).toBe(true);
  expect(matrixAt(mesh, 2).elements).toEqual(other);
  chairs.hide(0);
  expect(matrixAt(mesh, 0).determinant()).toBe(0);
  expect(matrixAt(mesh, 2).elements).toEqual(other);
  chairs.hide(2);
  expect(mesh.count).toBe(0);
  chairs.draw(0, new THREE.Vector3());
  expect(mesh.count).toBe(1);
  expect(mesh.geometry).toBe(geometry);
  expect(mesh.material).toBe(material);
  chairs.dispose();
});

it('민트·코랄 편 색을 독립적으로 적용하고 자기 자원만 한 번 정리한다', () => {
  const scene = new THREE.Scene(), unrelated = new THREE.Group();
  scene.add(unrelated);
  const chairs = createSparringChairs(scene, 2), [mesh] = chairs.pickMeshes;
  chairs.draw(0, new THREE.Vector3(), 1, {}, 'a');
  chairs.draw(1, new THREE.Vector3(2, 0, 0), 1, {}, 'b');
  const a = new THREE.Color(), b = new THREE.Color();
  mesh.getColorAt(0, a); mesh.getColorAt(1, b);
  expect(a.getHex()).toBe(0x2ac1bc);
  expect(b.getHex()).toBe(0xed6a5a);
  chairs.draw(0, new THREE.Vector3(), 1, {}, 'b');
  mesh.getColorAt(0, a);
  expect(a.getHex()).toBe(0xed6a5a);
  const disposals = [mesh, mesh.geometry, mesh.material].map(value => jest.spyOn(value, 'dispose'));
  chairs.dispose(); chairs.dispose();
  expect(scene.children).toEqual([unrelated]);
  disposals.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
  chairs.draw(0, new THREE.Vector3()); chairs.hide(0);
  expect(scene.children).toEqual([unrelated]);
});
