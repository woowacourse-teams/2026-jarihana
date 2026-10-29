import { createTransportScene } from '../../public/sparring-arena/src/transport-scene.js';

jest.mock('../../public/sparring-arena/src/characters.js', () => ({ createCharacters: jest.fn() }));

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

function path(start, end) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return {
    getAttribute: () => `${start.x},${start.y}:${end.x},${end.y}`,
    getTotalLength: () => length,
    getPointAtLength: distance => ({
      x: start.x + (end.x - start.x) * distance / length,
      y: start.y + (end.y - start.y) * distance / length,
    }),
  };
}

const entry = side => ({
  side, diameter: 40, inlet: { x: side === 'a' ? 250 : 750, y: 500 },
  frontPath: path({ x: side === 'a' ? 250 : 750, y: 500 }, { x: side === 'a' ? 20 : 980, y: 500 }),
  backPath: path({ x: side === 'a' ? 20 : 980, y: 100 }, { x: side === 'a' ? 150 : 850, y: 100 }),
});
const geometries = scene => {
  const found = [];
  scene.traverse(object => { if (object.geometry && !object.isInstancedMesh) found.push(object.geometry); });
  return found;
};

it('호스는 원통 노즐 뒤에서 같은 지름으로 이어지고 경로를 다시 읽어도 메시를 재사용한다', () => {
  const transport = createTransportScene(null);
  const layout = [entry('a'), entry('b')];
  transport.update(layout, 1000, 700);
  const before = geometries(transport.front);
  expect(before.filter(geometry => geometry.type === 'TubeGeometry')).toHaveLength(4);
  for (const group of transport.front.children.filter(object => object.isGroup && object.children.some(child => !child.isInstancedMesh && child.geometry?.type === 'TubeGeometry'))) {
    const barrel = group.children.find(object => object.isGroup);
    const tube = group.children.find(object => !object.isInstancedMesh && object.geometry?.type === 'TubeGeometry');
    const cylinder = barrel.children[0].geometry;
    expect(tube.geometry.parameters.radius).toBe(cylinder.parameters.radiusTop);
    const hoseStart = tube.geometry.parameters.path.getPoint(0);
    const rear = barrel.position.clone().add(
      barrel.position.clone().set(0, 0, -cylinder.parameters.height / 2).applyQuaternion(barrel.quaternion),
    );
    expect(hoseStart.distanceTo(rear)).toBeLessThan(0.001);
  }
  transport.update(layout, 1000, 700);
  expect(geometries(transport.front)).toEqual(before);
  transport.dispose();
});

it('화면 크기와 연결부가 바뀌면 이전 메시를 해제하고, 제거 시 앞뒤 호스를 함께 비운다', () => {
  const transport = createTransportScene(null);
  transport.update([entry('a')], 1000, 700);
  const old = [...geometries(transport.front), ...geometries(transport.back)];
  const dispose = old.map(geometry => jest.spyOn(geometry, 'dispose'));
  transport.update([entry('a')], 390, 844);
  dispose.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  expect(transport.camera.left).toBe(-195);
  transport.update([], 390, 844);
  expect(geometries(transport.front)).toHaveLength(0);
  expect(geometries(transport.back)).toHaveLength(0);
  transport.dispose();
});
