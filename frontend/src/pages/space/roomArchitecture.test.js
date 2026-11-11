import savedPresets from './fixtures/rooms-v10.json';
import { getRoomLayout, PLAYER } from './roomLayout';
import { createInitialRoom, applyRoomTemplate, loadRoom, canPlace, placedItemElevation, validateRoom } from './roomState';
import { moveWalker } from './roomNavigation';
import { createRoomShell, disposeObject } from './roomModels';

const templates = ['climbing', 'band', 'dining', 'boardgame', 'study', 'photo'];

test.each(templates)('%s saved v10 keeps its geometry, editable items and materials without a storage write', template => {
  const previous = savedPresets[template];
  const storage = { getItem: () => JSON.stringify(previous), setItem: jest.fn() };
  const { room, warning } = loadRoom(storage);
  expect(warning).toBe('');
  expect(room).toEqual(previous);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(getRoomLayout(room)).toEqual(getRoomLayout(template, 10));
  expect(room.items.filter(item => !canPlace(item, room.items, room))).toEqual([]);
  const upstairs = room.items.find(item => item.level === 1 && !item.parentId && !item.elevation);
  expect(placedItemElevation(upstairs, room)).toBeGreaterThanOrEqual(getRoomLayout(room).mezzanine.height);
  const changed = { ...room, atmosphere: { ...room.atmosphere, floorColor: '#abcdef', wallMaterial: 'brick', floorPatternScale: 1.5 } };
  expect(validateRoom(changed)).toEqual(changed);
});

test.each(templates)('%s new preset uses revised dimensions and only explicit template application replaces saved geometry', template => {
  const previous = savedPresets[template];
  const fresh = createInitialRoom(template);
  expect(fresh.version).toBe(11);
  const layout = getRoomLayout(fresh), old = getRoomLayout(previous);
  expect(layout.building).not.toEqual(old.building);
  expect(layout.mezzanine).not.toEqual(old.mezzanine);
  expect(layout.stairs).not.toEqual(old.stairs);
  const applied = applyRoomTemplate(previous, template);
  expect(applied.version).toBe(11);
  expect(getRoomLayout(applied)).toEqual(layout);
  expect(validateRoom(applied)).toEqual(applied);
});

test.each(templates)('%s saved stairs remain connected to their historical deck', template => {
  for (const room of [savedPresets[template]]) {
    const { stairs, mezzanine } = getRoomLayout(room);
    const x = (stairs.minX + stairs.maxX) / 2;
    let position = { ...PLAYER.spawn, y: 0 };
    for (const target of [{ x: -2, z: 4.2 }, { x, z: 4.2 }, { x, z: mezzanine.maxZ - 0.7 }]) {
      position = moveWalker(position, { x: target.x - position.x, z: target.z - position.z }, room);
      expect(position.x).toBeCloseTo(target.x);
      expect(position.z).toBeCloseTo(target.z);
    }
    expect(position.y).toBeCloseTo(mezzanine.height);
  }
});


test.each(templates)('%s shell uses the requested revision for floor and deck geometry', template => {
  for (const version of [10, 11]) {
    const layout = getRoomLayout(template, version);
    const shell = createRoomShell({ template, version });
    try {
      const floor = shell.children.find(child => child.name === 'floor-slab');
      const deck = shell.getObjectByName('clubhouse-mezzanine').getObjectByName('floor-slab');
      expect(floor.geometry.parameters.width).toBe(layout.building.maxX - layout.building.minX);
      expect(floor.geometry.parameters.depth).toBe(layout.building.maxZ - layout.building.minZ);
      expect(deck.position.y + 0.12).toBeCloseTo(layout.mezzanine.height);
      expect(deck.geometry.parameters.width).toBe(layout.mezzanine.maxX - layout.mezzanine.minX);
      expect(deck.geometry.parameters.depth).toBe(layout.mezzanine.maxZ - layout.mezzanine.minZ);
    } finally { disposeObject(shell); }
  }
});
