import { createTransportScene } from '../../public/sparring-arena/src/transport-scene.js';
import { addPipeRings } from '../../public/sparring-arena/src/pipe-surfaces.js';
import * as THREE from 'three';

jest.mock('../../public/sparring-arena/src/characters.js', () => ({ createCharacters: jest.fn() }));

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

const arenaCamera = new THREE.PerspectiveCamera(48, 1000 / 700, 0.1, 100);
arenaCamera.position.set(0, -5.5, 19); arenaCamera.lookAt(0, -1.5, 0);
arenaCamera.updateMatrixWorld();
const view = { camera: arenaCamera, bounds: { left: 0, top: 0, width: 1000, height: 700 } };
const entry = side => ({
  side, diameter: 40, inlet: { x: side === 'a' ? 250 : 750, y: 600 },
  outlet: { rear: [side === 'a' ? -10 : 10, 3, -1], mouth: [side === 'a' ? -8 : 8, 3.2, 0], direction: [side === 'a' ? 0.92 : -0.92, 0.08, 0.384] },
});
const geometries = scene => {
  const found = [];
  scene.traverse(object => { if (object.geometry && !object.isInstancedMesh) found.push(object.geometry); });
  return found;
};

it.each([240, 275])('앞뒤 호스 경계 %ipx에서도 노즐 링까지 같은 간격을 유지한다', seam => {
  const front = new THREE.Group(), back = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  const curve = (from, to) => new THREE.LineCurve3(new THREE.Vector3(from, 0, 0), new THREE.Vector3(to, 0, 0));
  addPipeRings(front, curve(0, seam), 40, material, { spacing: 120, end: 600 });
  addPipeRings(back, curve(seam, 640), 40, material, { offset: seam, spacing: 120, end: 600 });
  const positions = [0];
  for (const group of [front, back]) for (const mesh of group.children) {
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix);
      positions.push(new THREE.Vector3().setFromMatrixPosition(matrix).x);
    }
    mesh.geometry.dispose(); mesh.dispose();
  }
  positions.push(600);
  expect(positions).toEqual([0, 120, 240, 360, 480, 600]);
  material.dispose();
});

it('입구부터 호스까지 하나의 관으로 이어지고 경로를 다시 읽어도 메시를 재사용한다', () => {
  const transport = createTransportScene(null);
  const layout = [entry('a'), entry('b')];
  transport.update(layout, 1000, 700, view);
  const before = geometries(transport.world);
  expect(before.filter(geometry => geometry.type === 'TubeGeometry')).toHaveLength(4);
  for (const group of transport.world.children.filter(object => object.isGroup && object.children.some(child => !child.isInstancedMesh && child.geometry?.type === 'TubeGeometry'))) {
    const barrel = group.children.find(object => object.isGroup);
    const tube = group.children.find(object => !object.isInstancedMesh && object.geometry?.type === 'TubeGeometry');
    const tubeStart = tube.geometry.parameters.path.getPoint(0);
    const vertex = new THREE.Vector3().fromBufferAttribute(tube.geometry.attributes.position, 0);
    expect(vertex.distanceTo(tubeStart)).toBeCloseTo(0.8, 5);
    const lip = barrel.children[0];
    const mouth = barrel.position.clone().add(lip.position.clone().applyQuaternion(barrel.quaternion));
    expect(tubeStart.distanceTo(mouth)).toBeLessThan(0.001);
  }
  transport.update(layout, 1000, 700, view);
  expect(geometries(transport.world)).toEqual(before);
  transport.dispose();
});

it('화면 크기와 연결부가 바뀌면 이전 메시를 해제하고, 제거 시 앞뒤 호스를 함께 비운다', () => {
  const transport = createTransportScene(null);
  transport.update([entry('a')], 1000, 700, view);
  const old = geometries(transport.world);
  const dispose = old.map(geometry => jest.spyOn(geometry, 'dispose'));
  transport.update([entry('a')], 390, 844, { ...view, bounds: { ...view.bounds, width: 390, height: 844 } });
  dispose.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  expect(transport.camera.left).toBe(-195);
  transport.update([], 390, 844, { ...view, bounds: { ...view.bounds, width: 390, height: 844 } });
  expect(geometries(transport.world)).toHaveLength(0);
  transport.dispose();
});
