import { ENTRANCE, PLAYER, getRoomLayout, roomZoneAt } from "./roomLayout";
import { isWalkablePosition, moveWalker } from "./roomNavigation";
import * as roomState from "./roomState";

const { canPlace, createInitialRoom, placedItemElevation } = roomState;

describe("walkable clubhouse", () => {
  test("consecutive walking steps reuse furniture elevations until the room changes", () => {
    const bench = { id: "bench", kind: "bench", x: -2, z: 4.4, rotation: 0 };
    const room = { ...createInitialRoom(), items: [bench] };
    const elevation = jest.spyOn(roomState, "placedItemElevation");
    const delta = { x: 0, z: -0.1 };
    try {
      let position = moveWalker(PLAYER.spawn, delta, room);
      position = moveWalker(position, delta, room);
      expect(position.z).toBeCloseTo(PLAYER.spawn.z - 0.2);
      expect(elevation).toHaveBeenCalledTimes(1);

      const edited = { ...room, items: [{ ...bench, z: 5.85 }] };
      expect(isWalkablePosition(position, edited)).toBe(true);
      expect(moveWalker(position, delta, edited)).toEqual(position);
      expect(elevation).toHaveBeenCalledTimes(2);
    } finally {
      elevation.mockRestore();
    }
  });

  test("the original lounge connects entrance corridor, hall and both side rooms", () => {
    const room = createInitialRoom("lounge");
    let position = { ...PLAYER.spawn };
    expect(isWalkablePosition(position, room)).toBe(true);
    position = moveWalker(position, { x: 0, z: -4.8 }, room);
    expect(position.x).toBeCloseTo(-2);
    expect(position.z).toBeCloseTo(2);
    const frontRoom = moveWalker(position, { x: 7.3, z: 0 }, room);
    expect(frontRoom.x).toBeCloseTo(5.3);
    expect(frontRoom.z).toBeCloseTo(2);
    position = moveWalker(position, { x: 0, z: -6.1 }, room);
    expect(position.z).toBeCloseTo(-4.1);
    const backRoom = moveWalker(position, { x: 7.3, z: 0 }, room);
    expect(backRoom.x).toBeCloseTo(5.3);
    expect(backRoom.z).toBeCloseTo(-4.1);
    const outside = moveWalker(position, { x: 0, z: 10.9 }, room);
    expect(outside.z).toBeCloseTo(6.8);
  });

  test("front wall, partition and outer boundary stop large movements", () => {
    const room = { ...createInitialRoom(), items: [] };
    const front = moveWalker({ x: -6, z: 7 }, { x: 0, z: -12 }, room);
    expect(front.z).toBeGreaterThanOrEqual(5.42);
    expect(front.z).toBeLessThan(5.57);
    const partition = moveWalker({ x: 0, z: 0 }, { x: 9, z: 0 }, room);
    expect(partition.x).toBeLessThanOrEqual(3.6);
    expect(partition.x).toBeGreaterThan(3.45);
    expect(moveWalker({ x: 0, z: 7 }, { x: 100, z: 0 }, room).x).toBeLessThanOrEqual(getRoomLayout(room).island.walkable.maxX - PLAYER.radius);
  });

  test("the default staircase connects the furnished 2nd floor and lets walkers return to the hall", () => {
    const room = createInitialRoom("lounge");
    const { stairs, mezzanine } = getRoomLayout("lounge");
    const x = (stairs.minX + stairs.maxX) / 2;
    const hallEntrance = moveWalker(PLAYER.spawn, { x: 0, z: -2.4 }, room);
    const start = moveWalker(hallEntrance, { x: x - hallEntrance.x, z: 0 }, room);
    expect(start.x).toBeCloseTo(x);
    expect(start.z).toBeCloseTo(4.4);
    const landing = moveWalker(start, { x: 0, z: stairs.minZ - start.z - 0.85 }, room);
    expect(landing.y).toBeCloseTo(mezzanine.height);
    expect(landing.z).toBeLessThan(stairs.minZ - 0.7);
    const across = moveWalker(landing, { x: 14, z: 0 }, room);
    expect(across.x).toBeCloseTo(x + 14);
    const edge = moveWalker(across, { x: 0, z: 3 }, room);
    expect(edge.z).toBeLessThan(mezzanine.maxZ - PLAYER.radius);
    const backAtStairs = moveWalker(across, { x: -14, z: 0 }, room);
    const returned = moveWalker(backAtStairs, { x: 0, z: start.z - backAtStairs.z }, room);
    expect(returned.y).toBe(0);
    expect(returned.z).toBeCloseTo(start.z);
  });

  test("diagonal movement slides along a wall without cutting its corner", () => {
    const room = { ...createInitialRoom(), items: [] };
    const position = moveWalker({ x: 3.2, z: 0 }, { x: 1, z: 0.6 }, room);
    expect(position.x).toBeLessThanOrEqual(3.6);
    expect(position.z).toBeCloseTo(0.6);
    expect(isWalkablePosition(position, room)).toBe(true);
    expect(isWalkablePosition({ x: getRoomLayout(room).island.surface.maxX, z: 5.1 }, room)).toBe(false);
  });

  test("furniture blocks walking while the unobstructed crash mat is walkable", () => {
    const room = createInitialRoom("climbing");
    const sofa = room.items.find(item => item.id === 'lounge-sofa');
    expect(isWalkablePosition({x:sofa.x,z:sofa.z,y:0},room)).toBe(false);
    expect(isWalkablePosition({x:-9.5,z:-4,y:0.35},room)).toBe(false);
    expect(isWalkablePosition({x:-7.2,z:0.3,y:0.385},room)).toBe(true);
    const band = createInitialRoom('band'), drums = band.items.find(item => item.kind === 'drumKit');
    expect(isWalkablePosition({x:drums.x,z:drums.z,y:0.25},band)).toBe(false);
  });

  test("invalid input cannot introduce non-finite player coordinates", () => {
    const position = { x: -2, z: 10 };
    const room = createInitialRoom();
    expect(moveWalker(position, { x: Infinity, z: 0 }, room)).toEqual(position);
    expect(isWalkablePosition({ x: NaN, z: 1 }, room)).toBe(false);
    expect(isWalkablePosition(position, room, -1)).toBe(false);
  });
});

describe("tall independent lofts", () => {
  test.each(['climbing','boardgame','dining','band','study','photo'])('%s blocks stair sides and loft edges', template => {
    const room = {...createInitialRoom(template),items:[]};
    const {stairs:s,mezzanine:m}=getRoomLayout(template);
    const onRight = s.minX > 0;
    const x=onRight?s.minX-1:s.maxX+1;
    const side=moveWalker({x,z:(s.minZ+s.maxZ)/2,y:0},{x:onRight?2:-2,z:0},room);
    if(onRight)expect(side.x).toBeLessThan(s.minX-PLAYER.radius);
    else expect(side.x).toBeGreaterThan(s.maxX+PLAYER.radius);
    expect(side.y).toBe(0);
    const middle=(m.minX+m.maxX)/2;
    const front=moveWalker({x:middle,z:m.maxZ-1,y:m.height},{x:0,z:3},room);
    expect(front.z).toBeLessThanOrEqual(m.maxZ-PLAYER.radius);
    expect(front.y).toBeCloseTo(m.height);
    expect(isWalkablePosition({x:middle,z:2,y:m.height},room)).toBe(false);
  });
  test('ground beneath a deck stays walkable and upper furniture blocks only its own floor',()=>{
    const room={...createInitialRoom('climbing'),items:[{id:'upper',kind:'table',x:4,z:-10,rotation:0,level:1}]};
    expect(isWalkablePosition({x:4,z:-10,y:0},room)).toBe(true);
    expect(isWalkablePosition({x:4,z:-10,y:getRoomLayout('climbing').mezzanine.height},room)).toBe(false);
  });
  test('furnished boardgame central aisle reaches the library without crossing a table',()=>{
    const room=createInitialRoom('boardgame');
    const p=moveWalker({x:0,z:4.2,y:0},{x:0,z:-12.7},room);
    expect(p.z).toBeCloseTo(-8.5);expect(p.y).toBe(0);
    expect(isWalkablePosition({x:0.45,z:-9.8,y:0},room)).toBe(false);
  });
  test('scaled climbing mat lifts the walker 38.5cm then returns to floor',()=>{
    const room=createInitialRoom('climbing');
    let p=moveWalker({x:-5.8,z:0.3,y:0},{x:-1.4,z:0},room);
    expect(p.x).toBeCloseTo(-7.2);expect(p.y).toBeCloseTo(0.385);
    expect(isWalkablePosition({...p,y:0},room)).toBe(false);
    p=moveWalker(p,{x:1.4,z:0},room);expect(p.y).toBe(0);
  });
});

test("large lounge rugs allow walking across their whole surface", () => {
  const room = { ...createInitialRoom("boardgame"), items: [
    { id: "rug", kind: "loungeRug", x: 4.8, z: -2.2, rotation: 0 }
  ] };
  const position = moveWalker({ x: 4.8, z: 2 }, { x: 0, z: -7 }, room);
  expect(position.z).toBeCloseTo(-5);
  expect(position.y).toBe(0);
});


test.each(["lounge", "climbing", "boardgame", "dining", "band", "study", "photo"].flatMap(template =>
  [9, 10, 11].map(version => [template, version])))("%s v%s stops at its exterior boundary and never enters the street", (template, version) => {
  const room = { ...createInitialRoom(template), version, items: [] };
  const layout = getRoomLayout(room);
  const exterior = layout.island.walkable;
  expect(isWalkablePosition(PLAYER.spawn, room)).toBe(true);
  expect(isWalkablePosition({ x: -2, z: 10 }, room)).toBe(true);
  expect(isWalkablePosition({ x: -2, z: 14 }, room)).toBe(true);
  const end = moveWalker(PLAYER.spawn, { x: 0, z: 20 }, room);
  expect(end.z).toBeLessThanOrEqual(exterior.maxZ - PLAYER.radius);
  expect(end.z).toBeGreaterThan(exterior.maxZ - 0.5);
  const right = moveWalker(PLAYER.spawn, { x: 30, z: 0 }, room);
  expect(right.x).toBeLessThanOrEqual(exterior.maxX - PLAYER.radius);
  expect(right.x).toBeGreaterThan(exterior.maxX - 0.5);
  const left = moveWalker(PLAYER.spawn, { x: -30, z: 0 }, room);
  expect(left.x).toBeGreaterThanOrEqual(exterior.minX + PLAYER.radius);
  expect(left.x).toBeLessThan(exterior.minX + 0.5);
});

describe("current exterior terraces", () => {
  test.each(["lounge", "climbing", "boardgame", "dining", "band", "study", "photo"])("%s connects the enlarged front garden and back lawn", (template) => {
    const room = createInitialRoom(template);
    const { building, island } = getRoomLayout(room);
    const frontZ = building.maxZ + 15;
    const backZ = building.minZ - 10;
    const sideX = building.maxX + 6;
    let walker = { ...PLAYER.spawn };
    for (const target of [
      { x: walker.x, z: frontZ, zone: "앞마당 정원" },
      { x: sideX, z: frontZ, zone: "앞마당 정원" },
      { x: sideX, z: building.minZ + 2, zone: "옆마당 산책길" },
      { x: sideX, z: backZ, zone: "뒷마당" },
      { x: 0, z: backZ, zone: "뒷마당" }
    ]) {
      walker = moveWalker(walker, { x: target.x - walker.x, z: target.z - walker.z }, room);
      expect(walker.x).toBeCloseTo(target.x);
      expect(walker.z).toBeCloseTo(target.z);
      expect(roomZoneAt(walker.x, walker.z, room)).toBe(target.zone);
    }
    expect(canPlace({ id: "garden-bench", kind: "bench", x: 0, z: backZ, rotation: 0 }, room.items, room)).toBe(true);
    expect(isWalkablePosition({ x: 0, z: island.surface.minZ + 1 }, room)).toBe(false);
  });

  test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s shares the exterior plan with editable island grounds", template => {
    const room = createInitialRoom(template);
    const { building, entrance, terrace, mezzanine } = getRoomLayout(room);
    expect(entrance).toEqual({ ...ENTRANCE, minX: building.minX, maxX: building.maxX });
    expect(terrace).toEqual({
      minX: building.minX, maxX: building.maxX, minZ: building.maxZ, maxZ: building.maxZ + 5.6,
      fixtures: [building.minX + 2.1, building.maxX - 2.1].map(x => ({
        x, z: building.maxZ + 4.65, width: 3.2, depth: 1.2
      }))
    });
    expect(getRoomLayout({ ...room, version: 10 }).terrace).toBeUndefined();
    expect(getRoomLayout({ ...room, version: 12 }).terrace).toEqual(terrace);
    expect(canPlace({ id: "outside", kind: "stool", x: 0, z: 9, rotation: 0 }, [], room)).toBe(true);
    expect(isWalkablePosition({ x: -2, z: 9.5, y: mezzanine.height }, room)).toBe(false);
    expect(roomZoneAt(-2, 6.8, room)).toBe("현관 앞 마당");
    expect(roomZoneAt(-2, 9.5, room)).toBe("야외 테라스");
  });

  test("unknown and original lounge layouts do not acquire a terrace", () => {
    expect(getRoomLayout("lounge").terrace).toBeUndefined();
    expect(getRoomLayout("unknown").terrace).toBeUndefined();
  });

  test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s keeps the furnished door passage open to the terrace and back", template => {
    const room = createInitialRoom(template);
    let position = moveWalker({ x: -2, z: 4.2, y: 0 }, { x: 0, z: 5.3 }, room);
    expect(position.x).toBeCloseTo(-2);
    expect(position.z).toBeCloseTo(9.5);
    expect(position.y).toBe(0);
    position = moveWalker(position, { x: 0, z: -5.3 }, room);
    expect(position.z).toBeCloseTo(4.2);
    expect(position.y).toBe(0);
  });

  test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s blocks terrace fixtures and allows stepping onto the lawn", template => {
    const room = createInitialRoom(template);
    const { terrace } = getRoomLayout(room);
    for (const fixture of terrace.fixtures) {
      expect(isWalkablePosition({ x: fixture.x, z: fixture.z, y: 0 }, room)).toBe(false);
      const stop = moveWalker({ x: fixture.x, z: 8.4, y: 0 }, { x: 0, z: 3 }, room);
      const limit = fixture.z - fixture.depth / 2 - PLAYER.radius;
      expect(stop.z).toBeLessThanOrEqual(limit);
      expect(stop.z).toBeGreaterThan(limit - 0.16);
    }
    for (const x of [terrace.minX + PLAYER.radius / 2, terrace.maxX - PLAYER.radius / 2]) {
      expect(isWalkablePosition({ x, z: 8.6, y: 0 }, room)).toBe(true);
    }
    expect(isWalkablePosition({ x: -2, z: terrace.maxZ - PLAYER.radius / 2, y: 0 }, room)).toBe(true);
  });
});

describe("independent themed floor plans", () => {
  test.each(["climbing", "boardgame", "dining", "band", "study", "photo"])("%s connects its furnished entrance to the loft and back", (template) => {
    const room = createInitialRoom(template);
    const { stairs, mezzanine } = getRoomLayout(template);
    const stairX = (stairs.minX + stairs.maxX) / 2;
    const loftX = (mezzanine.minX + mezzanine.maxX) / 2;
    const landingZ = stairs.minZ - 0.65;
    let position = moveWalker(PLAYER.spawn, { x: 0, z: 4.2 - PLAYER.spawn.z }, room);
    expect(position.z).toBeCloseTo(4.2);
    position = moveWalker(position, { x: stairX - position.x, z: 0 }, room);
    expect(position.x).toBeCloseTo(stairX);
    position = moveWalker(position, { x: 0, z: landingZ - position.z }, room);
    expect(position.z).toBeCloseTo(landingZ);
    expect(position.y).toBeCloseTo(mezzanine.height);
    position = moveWalker(position, { x: loftX - position.x, z: 0 }, room);
    expect(position.x).toBeCloseTo(loftX);
    expect(position.y).toBeCloseTo(mezzanine.height);
    position = moveWalker(position, { x: stairX - position.x, z: 0 }, room);
    position = moveWalker(position, { x: 0, z: 4.2 - position.z }, room);
    expect(position.z).toBeCloseTo(4.2);
    expect(position.y).toBe(0);
    position = moveWalker(position, { x: PLAYER.spawn.x - position.x, z: 0 }, room);
    position = moveWalker(position, { x: 0, z: PLAYER.spawn.z - position.z }, room);
    expect(position.x).toBeCloseTo(PLAYER.spawn.x);
    expect(position.z).toBeCloseTo(PLAYER.spawn.z);
  });
});

describe("movable raised surfaces", () => {
  test("moving and deleting a crash mat updates height at its actual position in another theme", () => {
    const mat = { id: "portable-mat", kind: "crashMat", x: -6, z: 0, rotation: 0 };
    const room = { ...createInitialRoom("lounge"), items: [mat] };
    let position = moveWalker({ x: -3.2, z: 0, y: 0 }, { x: -2, z: 0 }, room);
    expect(position.x).toBeCloseTo(-5.2);
    expect(position.y).toBeCloseTo(0.35);
    const moved = { ...room, items: [{ ...mat, z: -3 }] };
    expect(isWalkablePosition({ ...position, y: 0 }, moved)).toBe(true);
    expect(isWalkablePosition(position, moved)).toBe(false);
    expect(isWalkablePosition({ x: -6, z: -3, y: 0.35 }, moved)).toBe(true);
    position = moveWalker(position, { x: 0.2, z: 0 }, moved);
    expect(position.y).toBe(0);
    const deleted = { ...moved, items: [] };
    expect(isWalkablePosition({ x: -6, z: -3, y: 0 }, deleted)).toBe(true);
    expect(isWalkablePosition({ x: -6, z: -3, y: 0.35 }, deleted)).toBe(false);
  });

  test("rotating a rectangular mat rotates the raised walking footprint", () => {
    const mat = { id: "mat", kind: "crashMat", x: -6, z: 0, rotation: 0 };
    const room = { ...createInitialRoom("lounge"), items: [mat] };
    expect(isWalkablePosition({ x: -4.3, z: 0, y: 0.35 }, room)).toBe(true);
    const rotated = { ...room, items: [{ ...mat, rotation: 1 }] };
    expect(isWalkablePosition({ x: -4.3, z: 0, y: 0 }, rotated)).toBe(true);
    expect(isWalkablePosition({ x: -6, z: 1.7, y: 0.35 }, rotated)).toBe(true);
  });

  test("stage supports lift instruments and keep their collision while the free stage remains walkable", () => {
    const platform = { id: "stage", kind: "rehearsalStage", x: 3, z: 0, rotation: 0 };
    const drums = { id: "drums", kind: "drumKit", x: 3, z: -0.3, rotation: 0 };
    const room = { ...createInitialRoom("study"), items: [platform, drums] };
    expect(placedItemElevation(drums, room)).toBeCloseTo(0.25);
    let position = moveWalker({ x: 3, z: 2.7, y: 0 }, { x: 0, z: -1.2 }, room);
    expect(position.z).toBeCloseTo(1.5);
    expect(position.y).toBeCloseTo(0.25);
    expect(isWalkablePosition(position, room)).toBe(true);
    expect(isWalkablePosition({ x: 3, z: -0.3, y: 0.25 }, room)).toBe(false);
    position = moveWalker(position, { x: 0, z: -1 }, room);
    expect(position.z).toBeGreaterThan(1.24);
    const cleared = { ...room, items: [platform] };
    position = moveWalker(position, { x: 0, z: -1 }, cleared);
    expect(position.z).toBeLessThan(0.5);
    expect(position.y).toBeCloseTo(0.25);
    const moved = { ...room, items: [{ ...platform, x: -6 }, drums] };
    expect(placedItemElevation(drums, moved)).toBe(0);
    expect(isWalkablePosition({ x: 3, z: 1.5, y: 0 }, moved)).toBe(true);
    expect(isWalkablePosition({ x: 3, z: -0.3, y: 0 }, moved)).toBe(false);
  });
});
