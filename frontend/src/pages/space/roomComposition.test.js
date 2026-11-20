import { createInitialRoom, footprint, validateRoom } from './roomState';
import { getRoomLayout } from './roomLayout';
import { moveWalker, isWalkablePosition } from './roomNavigation';

test('the study has a shared work island, a library beside presentation and an upper meeting room', () => {
  const room = createInitialRoom('study');
  const desks = room.items.filter(item => item.kind === 'studyDesk');
  expect(desks).toHaveLength(4);
  const first = desks[0];
  expect(footprint(first).width).toBeCloseTo(5.06);
  for (const desk of desks) {
    const adjacent = desks.filter(other => other.id !== desk.id && (
      Math.abs(other.x-desk.x) < 0.01 && Math.abs(other.z-desk.z) < footprint(desk).depth+0.4 ||
      Math.abs(other.z-desk.z) < 0.01 && Math.abs(other.x-desk.x) < footprint(desk).width+0.4
    ));
    expect(adjacent.length).toBeGreaterThan(0);
  }
  const presentation = room.items.find(item => item.kind === 'projectScreen');
  const shelves = room.items.filter(item => item.kind === 'openDisplayShelf' && !item.level);
  expect(shelves.some(item => item.x > presentation.x && Math.abs(item.z-presentation.z) < 1)).toBe(true);
  expect(room.items.filter(item => item.level === 1 && item.kind === 'loftGlassPartition').length).toBeGreaterThan(1);
  expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
});

test('the furnished upper meeting room has a walkable entrance while its glass walls block walking', () => {
  const room = createInitialRoom('study'), layout = getRoomLayout('study');
  let walker = {x:(layout.stairs.minX + layout.stairs.maxX) / 2,z:-9.2,y:layout.mezzanine.height};
  for (const target of [{x:-3.3,z:-9.2},{x:-3.3,z:-11.9},{x:-4.7,z:-11.9},{x:-4.7,z:-13.85},{x:-5.35,z:-13.85}]) {
    walker = moveWalker(walker,{x:target.x-walker.x,z:target.z-walker.z},room);
    expect(walker.x).toBeCloseTo(target.x);expect(walker.z).toBeCloseTo(target.z);
  }
  expect(isWalkablePosition(walker,room)).toBe(true);
  const blocked = moveWalker(walker,{x:0,z:3},room);
  expect(blocked.z).toBeLessThan(-11.8);
  const glass = room.items.find(item => item.id === 'meeting-front-1');
  expect(isWalkablePosition({x:glass.x,z:glass.z,y:layout.mezzanine.height},room)).toBe(false);
});

test('the new partition is a saved editable asset, and removing it opens its footprint', () => {
  const original = createInitialRoom('study');
  const wall = original.items.find(item => item.id === 'meeting-front-1');
  const position = {x:wall.x,z:wall.z,y:getRoomLayout('study').mezzanine.height};
  expect(isWalkablePosition(position,original)).toBe(false);
  const room = {...original,items:original.items.filter(item=>item.id!==wall.id)};
  expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
  expect(isWalkablePosition(position,room)).toBe(true);
});
