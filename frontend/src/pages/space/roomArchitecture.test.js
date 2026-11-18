import { Box3 } from "three";
import savedPresets from './fixtures/rooms-v10.json';
import { bindRoomBlueprint, getRoomLayout, PLAYER } from './roomLayout';
import { createInitialRoom, applyRoomTemplate, loadRoom, canPlace, placedItemElevation, validateRoom } from './roomState';
import { isWalkablePosition, moveWalker } from './roomNavigation';
import { createRoomShell, disposeObject } from './roomModels';

test("a published blueprint controls rendering, collision and placement independently of the room document version", () => {
  const template = "study";
  const room = { ...createInitialRoom(template), items: [] };
  const geometry = getRoomLayout(room);
  const blocker = { x: -2, z: 1, width: 2, depth: 2, height: 3 };
  const changed = { ...geometry, building: { ...geometry.building, minX: geometry.building.minX - 2 },
    island: { ...geometry.island, surface: { ...geometry.island.surface, maxX: geometry.island.surface.maxX + 6 },
      walkable: { ...geometry.island.walkable, maxX: geometry.island.walkable.maxX + 6 } }, walls: [...geometry.walls, blocker],
    mezzanine: { ...geometry.mezzanine, height: geometry.mezzanine.height + 1 } };
  const pinned = bindRoomBlueprint(room, { blueprintRef: { templateKey: template, version: 13 }, geometry: changed });
  const item = { id: "stool", kind: "stool", x: -2, z: 1, rotation: 0 };
  expect(isWalkablePosition({ x: -2, y: 0, z: 1 }, room)).toBe(true);
  expect(isWalkablePosition({ x: -2, y: 0, z: 1 }, pinned)).toBe(false);
  expect(canPlace(item, [], pinned)).toBe(false);
  expect(validateRoom({ ...pinned, items: [item] })).toBeNull();
  expect(getRoomLayout(validateRoom(pinned))).toBe(changed);
  expect(JSON.parse(JSON.stringify(pinned))).toEqual(room);
  const shell = createRoomShell(pinned);
  try {
    const deck = shell.getObjectByName("clubhouse-mezzanine").getObjectByName("floor-slab");
    expect(deck.position.y + 0.12).toBeCloseTo(changed.mezzanine.height);
    const lawn = new Box3().setFromObject(shell.getObjectByName("island-lawn"));
    expect(lawn.max.x).toBeCloseTo(changed.island.surface.maxX);
    const spotlights = [];
    shell.traverse(child => { if (child.name === "yard-facade-spotlight") spotlights.push(child.position.x); });
    expect(Math.max(...spotlights)).toBeCloseTo(changed.island.walkable.maxX - 0.4);
    const roof = new Box3().setFromObject(shell.getObjectByName("ceiling"));
    expect(roof.min.x).toBeCloseTo(changed.building.minX);
    expect(roof.max.x).toBeCloseTo(changed.building.maxX);
    const walls = shell.children.filter(child => child.name === "clubhouse-wall");
    expect(walls).toHaveLength(changed.walls.length);
    const bounds = new Box3().setFromObject(walls.at(-1).getObjectByName("plaster-wall"));
    expect(bounds.min.x).toBeCloseTo(blocker.x - blocker.width / 2);
    expect(bounds.max.z).toBeCloseTo(blocker.z + blocker.depth / 2);
    expect(bounds.max.y).toBeCloseTo(blocker.height);
  } finally { disposeObject(shell); }
});

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
