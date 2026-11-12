import previousRooms from './fixtures/rooms-v9.json';
import { transformAttachedItems } from './assetCustomization';
import { getRoomLayout, PLAYER } from "./roomLayout";
import { createLegacyFacilityItems } from "./legacyFacilityCatalog";
import {
  ATMOSPHERE_PRESETS, TEMPLATE_ATMOSPHERES, CATALOG, DEFAULT_ATMOSPHERE, MAX_ITEMS, MAX_PHOTO_LENGTH, ROOM_TEMPLATES, STORAGE_KEY, applyRoomTemplate, canPlace,
  createInitialRoom, findOpenPosition, footprint, historyReducer, isSafeRecordLink,
  loadRoom, saveRoom, snapPosition, validateRoom
} from "./roomState";

describe("space placement", () => {
  test("starter room is valid and can round-trip through storage", () => {
    const room = createInitialRoom();
    expect(validateRoom(room)).toEqual(room);
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    saveRoom(storage, room);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(room));
    expect(loadRoom(storage)).toEqual({ room, warning: "" });
  });
  test("loading an old v11 preset moves only its default outdoor turntable", () => {
    const room = createInitialRoom("band");
    const turntable = room.items.find(({ kind }) => kind === "musicConsole");
    const { building } = getRoomLayout(room);
    const old = { ...turntable, x: building.maxX - 3.3, z: 6.8, rotation: 0, color: "#80513e" };
    const other = { id: "user-stool", kind: "stool", x: 5, z: 6.8, rotation: 0 };
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    const load = (items) => {
      storage.getItem.mockReturnValue(JSON.stringify({ ...room, items }));
      return loadRoom(storage);
    };
    expect(load([old, other])).toEqual({ room: { ...room, items: [{ ...turntable, color: old.color }, other] }, warning: "" });
    const rotated = { ...old, rotation: 1 };
    expect(load([rotated, other])).toEqual({ room: { ...room, items: [rotated, other] }, warning: "" });
    const blocker = { ...other, x: turntable.x, z: turntable.z };
    const moved = load([old, blocker]).room;
    expect(moved.items[0]).toMatchObject({ id: old.id, color: old.color });
    expect(moved.items[0].z).toBeLessThan(building.maxZ);
    expect(moved.items[1]).toEqual(blocker);
    expect(validateRoom(moved)).toEqual(moved);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  test("rotated furniture uses its actual footprint", () => {
    expect(footprint({ kind: "sofa", rotation: 1 })).toMatchObject({ width: 1.1, depth: 2.8 });
    expect(canPlace({ kind: "sofa", rotation: 0, x: 9, z: 2 }, [])).toBe(false);
    expect(canPlace({ kind: "sofa", rotation: 1, x: 9, z: 2 }, [])).toBe(true);
  });
  test("prevents overlapping furnishings, but rugs may lie under them", () => {
    const sofa = { id: "one", kind: "sofa", rotation: 0, x: -6, z: 0 };
    expect(canPlace({ ...sofa, id: "two" }, [sofa])).toBe(false);
    expect(canPlace(sofa, [sofa])).toBe(true);
    expect(canPlace({ ...sofa, kind: "rug", id: "rug" }, [sofa])).toBe(true);
  });
  test("reserves partition walls and doorways, while removable kitchenette units own their collision", () => {
    for (const [x, z] of [[4, 0], [-2, 5], [4, -4.5]]) {
      expect(canPlace({ kind: "stool", rotation: 0, x, z }, [])).toBe(false);
    }
    const seat = { kind: "stool", rotation: 0, x: -6, z: -7 };
    expect(canPlace(seat, createInitialRoom().items)).toBe(false);
    expect(canPlace(seat, [])).toBe(true);
  });
  test("finds placement for every height-compatible asset in an empty clubhouse", () => {
    for (const { kind } of CATALOG.filter((asset) => (asset.height || 0) <= getRoomLayout("lounge").building.height)) {
      const position = findOpenPosition(kind, []);
      expect(position).not.toBeNull();
      expect(canPlace({ kind, rotation: 0, ...position }, [])).toBe(true);
    }
    expect(snapPosition(0.38)).toBe(0.5);
  });
});

describe("hobby clubhouse templates", () => {
  test.each(ROOM_TEMPLATES.map(({ id }) => [id]))("%s starts furnished, valid and without invented memories", (id) => {
    const room = createInitialRoom(id);
    expect(room.items.filter((entry) => !canPlace(entry, room.items, room))).toEqual([]);
    expect(validateRoom(room)).toEqual(room);
    expect(room.items.length).toBeGreaterThan(8);
    expect(room.items.some((item) => item.kind === "memory")).toBe(false);
    expect(room.coverPhoto).toBe("");
    expect(room.notice).toBe("");
    expect(room.items.some((item) => ["stool", "gameChair", "roundChair", "officeChair"].includes(item.kind))).toBe(true);
    for (const { kind } of CATALOG.filter((asset) => (asset.height || 0) <= getRoomLayout(id).building.height)) {
      const position = findOpenPosition(kind, [], id);
      expect(position).not.toBeNull();
      expect(canPlace({ kind, rotation: 0, ...position }, [], id)).toBe(true);
    }
  });

  test("climbing wall collisions follow the movable wall assets and disappear after removal", () => {
    const stool = { kind: "stool", rotation: 0, x: -9.1, z: -4 };
    expect(canPlace(stool, [], "lounge")).toBe(true);
    expect(canPlace(stool, createInitialRoom("climbing").items, "climbing")).toBe(false);
    expect(canPlace(stool, [], "climbing")).toBe(true);
    expect(canPlace({ ...stool, x: 0, z: 0 }, [], "climbing")).toBe(true);
    expect(createInitialRoom("dining").items.filter((item) => item.id.startsWith("communal-table-seat"))).toHaveLength(8);
  });

  test("changing template preserves identity and relocates a memory that would collide", () => {
    const photo = "data:image/jpeg;base64,YWJj";
    const room = { ...createInitialRoom(), name: "퇴근 후 한 홀드", coverPhoto: photo, notice: "다음 모임 이야기" };
    const memory = { id: "lounge-sofa", kind: "memory", x: 4.4, z: -0.6, rotation: 0,
      title: "함께한 하루", note: "소중한 기록", photo, link: "https://example.com/record" };
    room.items = [memory];
    const next = applyRoomTemplate(room, "climbing");
    expect(next).toMatchObject({ name: room.name, coverPhoto: photo, notice: room.notice, template: "climbing" });
    const moved = next.items.find((item) => item.id === memory.id);
    expect(moved).toMatchObject({ title: memory.title, note: memory.note, photo, link: memory.link });
    expect([moved.x, moved.z]).not.toEqual([memory.x, memory.z]);
    expect(validateRoom(next)).toEqual(next);
    expect(room.items).toEqual([memory]);
    const history = historyReducer({ past: [], present: room, future: [] }, { type: "change", room: next });
    expect(historyReducer(history, { type: "undo" }).present).toEqual(room);
  });

  test("capacity failure never silently removes a memory", () => {
    const room = { ...createInitialRoom(), items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) =>
      ({ id: "memory-" + i, kind: "memory", x: 0, z: 0, rotation: 0, title: "기록" })) };
    expect(() => applyRoomTemplate(room, "dining")).toThrow("추억을 모두 옮길 자리가 부족해요");
    expect(room.items).toHaveLength(MAX_ITEMS + 1);
  });

  test("old browser saves migrate in memory without writing or losing custom layouts", () => {
    const old = { version: 1, name: "예전 방", theme: "blue", avatarColor: "#536bd6",
      items: [{ id: "old", kind: "memory", x: 0, z: 0, rotation: 0, title: "지난 기록", note: "남겨 둔 메모" }] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const loaded = loadRoom(storage);
    expect(loaded.warning).toBe("");
    expect(loaded.room).toMatchObject({ version: 10, template: "lounge", name: old.name, atmosphere: DEFAULT_ATMOSPHERE });
    expect(loaded.room.items.find((item) => item.id === "old")).toEqual({ ...old.items[0], photo: "", link: "" });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test.each(["javascript:alert(1)", "data:text/html,hello", "/relative", "https://user:pass@example.com"])("rejects unsafe activity link %s", (link) => {
    expect(isSafeRecordLink(link)).toBe(false);
    const room = createInitialRoom();
    room.items = [{ id: "record", kind: "memory", x: 0, z: 0, rotation: 0, link }];
    expect(validateRoom(room)).toBeNull();
  });

  test("photo storage only accepts bounded inline raster images", () => {
    const room = createInitialRoom();
    for (const photo of ["https://example.com/photo.jpg", "data:image/svg+xml;base64,YWJj",
      "data:image/jpeg;base64," + "A".repeat(MAX_PHOTO_LENGTH)]) {
      expect(validateRoom({ ...room, coverPhoto: photo })).toBeNull();
    }
    expect(validateRoom({ ...room, coverPhoto: "data:image/png;base64,YWJj" })).not.toBeNull();
  });
});

describe("room atmosphere", () => {
  test("version 2 saves acquire defaults without writing or changing their identity and layout", () => {
    const old = { ...createInitialRoom("dining"), version: 2, name: "우리 저녁 식탁", notice: "토요일에 만나요",
      items: [{ id: "old-table", kind: "table", x: -5, z: 0, rotation: 0 }] };
    delete old.atmosphere;
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const loaded = loadRoom(storage);
    expect(loaded.warning).toBe("");
    expect(loaded.room).toMatchObject({ version: 10, name: old.name, notice: old.notice, atmosphere: DEFAULT_ATMOSPHERE });
    expect(loaded.room.items.find((item) => item.id === "old-table")).toEqual(old.items[0]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(loaded.room.atmosphere).not.toBe(DEFAULT_ATMOSPHERE);
  });

  test.each(ATMOSPHERE_PRESETS.map((preset) => [preset.id, preset.values]))("%s preset survives save and reload", (_id, values) => {
    const room = { ...createInitialRoom(), atmosphere: { ...values, wallColor: "#b8c9aa", floorColor: "#A47B58" } };
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    const saved = saveRoom(storage, room);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(loadRoom(storage).room).toEqual(room);
    expect(saved.atmosphere).not.toBe(room.atmosphere);
    expect(saved.items).not.toBe(room.items);
  });

  test("template selection applies its reference atmosphere and clears previous surface overrides", () => {
    const room = { ...createInitialRoom(), atmosphere: { ...ATMOSPHERE_PRESETS[2].values,
      backgroundStyle: "solid", wallColor: "#ccaabb", floorColor: "#bbaa88", shadows: false } };
    const next = applyRoomTemplate(room, "climbing");
    expect(next.atmosphere).toEqual(TEMPLATE_ATMOSPHERES.climbing);
    expect(validateRoom(next)).toEqual(next);
    expect(next.items).not.toEqual(room.items);
  });

  test.each([
    ["backgroundColor", "red"], ["backgroundColor", "#fff"], ["backgroundColor", "url(test)"],
    ["backgroundStyle", "image"], ["shadows", "true"], ["wallColor", null], ["floorColor", "#12345678"],
    ["ambient", -1], ["ambient", 151], ["ambient", "100"], ["ambient", NaN],
    ["sunlight", Infinity], ["sunlight", 151], ["lamps", 151], ["lamps", -5],
    ["warmth", 101], ["warmth", -1], ["sunAngle", 361], ["sunAngle", -1],
    ["shadowSoftness", 101], ["shadowSoftness", -1]
  ])("rejects malformed %s=%s rather than replacing it silently", (key, value) => {
    const room = createInitialRoom();
    expect(validateRoom({ ...room, atmosphere: { ...room.atmosphere, [key]: value } })).toBeNull();
  });

  test("only legacy saves may omit atmosphere; partial or null atmosphere is always invalid", () => {
    const room = createInitialRoom();
    for (const version of [1, 2, 3]) {
      for (const atmosphere of [null, [], {}, { ambient: 100 }]) {
        expect(validateRoom({ ...room, version, atmosphere })).toBeNull();
      }
    }
    expect(validateRoom({ ...room, atmosphere: undefined })).toBeNull();
  });

  test("accepts the slider bounds, disabled lights and independent default objects", () => {
    const room = createInitialRoom();
    expect(createInitialRoom().atmosphere).not.toBe(room.atmosphere);
    const atmosphere = { ...DEFAULT_ATMOSPHERE, ambient: 0, sunlight: 150, warmth: 0,
      sunAngle: 360, lamps: 0, shadowSoftness: 100, shadows: false, backgroundStyle: "solid" };
    expect(validateRoom({ ...room, atmosphere })?.atmosphere).toEqual(atmosphere);
  });
});

describe("room persistence and edit history", () => {
  test("version 3 migration moves new conflicts only and preserves identity, photos and atmosphere", () => {
    const photo = "data:image/jpeg;base64,YWJj";
    const old = { ...createInitialRoom(), version: 3, name: "우리 건물", coverPhoto: photo,
      notice: "다음 주에 만나요", atmosphere: { ...DEFAULT_ATMOSPHERE, sunlight: 45 }, items: [
        { id: "stable", kind: "armchair", x: -5.4, z: -2.4, rotation: 0 },
        { id: "blocked", kind: "table", x: 0.4, z: -0.6, rotation: 0 },
        { id: "memory", kind: "memory", x: 4, z: 0, rotation: 1, title: "첫 합주", note: "기억", photo, link: "https://example.com/record" }
      ] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const migrated = loadRoom(storage);
    expect(migrated.warning).toBe("");
    expect(migrated.room).toMatchObject({ version: 10, name: old.name, coverPhoto: photo, notice: old.notice, atmosphere: old.atmosphere });
    expect(migrated.room.items[0]).toEqual(old.items[0]);
    expect(migrated.room.items[1]).not.toEqual(old.items[1]);
    expect(migrated.room.items[2]).toMatchObject({ id: "memory", kind: "memory", rotation: 1, title: "첫 합주", note: "기억", photo, link: "https://example.com/record" });
    expect(validateRoom(migrated.room)).toEqual(migrated.room);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(old.items[1].x).toBe(0.4);
  });

  test("legacy migration rejects invalid old geometry instead of silently relocating corruption", () => {
    const base = { ...createInitialRoom(), version: 3 };
    for (const items of [
      [{ id: "outside", kind: "stool", x: 9, z: 0, rotation: 0 }],
      [{ id: "kitchen", kind: "stool", x: 5, z: -3.5, rotation: 0 }],
      [{ id: "one", kind: "stool", x: 0, z: 0, rotation: 0 }, { id: "two", kind: "stool", x: 0, z: 0, rotation: 0 }]
    ]) expect(validateRoom({ ...base, items })).toBeNull();
  });

  test("entrance furniture saves, keeps the doorway open and rejects scenery placement", () => {
    const bench = { id: "garden", kind: "bench", x: -7, z: 6.5, rotation: 0 };
    expect(canPlace(bench, [])).toBe(true);
    expect(canPlace({ ...bench, x: -2 }, [])).toBe(false);
    expect(canPlace({ ...bench, z: 14 }, [])).toBe(true);
    expect(canPlace({ ...bench, x: 10.5 }, [])).toBe(true);
    const storage = { getItem: jest.fn(), setItem: jest.fn() };
    const saved = saveRoom(storage, { ...createInitialRoom(), items: [bench] });
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(loadRoom(storage).room).toEqual(saved);
    const position = findOpenPosition("table", [], "band", "entrance");
    expect(position.z).toBeGreaterThan(5);
    expect(canPlace({ ...position, kind: "table", rotation: 0 }, [], "band")).toBe(true);
    expect(findOpenPosition("table", [], "band", "building").z).toBeLessThan(5);
  });

  test.each([
    (room) => ({ ...room, version: 99 }),
    (room) => ({ ...room, items: [...room.items, room.items[0]] }),
    (room) => ({ ...room, items: [{ ...room.items[0], kind: "unknown" }] }),
    (room) => ({ ...room, items: [{ ...room.items[0], x: Infinity }] }),
    (room) => ({ ...room, items: [{ ...room.items[0], x: 100 }] }),
    (room) => ({ ...room, items: [{ ...room.items[0], rotation: 0.5 }] }),
    (room) => ({ ...room, name: " " })
  ])("rejects malformed saved state %#", (change) => {
    expect(validateRoom(change(createInitialRoom()))).toBeNull();
  });
  test("load failures return a visible warning without destroying saved data", () => {
    const storage = { getItem: () => "broken JSON", setItem: jest.fn() };
    expect(loadRoom(storage).warning).toBeTruthy();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  test("save failures propagate so UI cannot claim success", () => {
    const storage = { setItem: () => { throw new Error("quota"); } };
    expect(() => saveRoom(storage, createInitialRoom())).toThrow("quota");
  });
  test("undo/redo round-trip edits; a new change clears redo; cancel clears history", () => {
    const first = createInitialRoom();
    const second = { ...first, theme: "sage" };
    let state = { past: [], present: first, future: [] };
    state = historyReducer(state, { type: "change", room: second });
    state = historyReducer(state, { type: "undo" });
    expect(state.present).toEqual(first);
    state = historyReducer(state, { type: "redo" });
    expect(state.present).toEqual(second);
    state = historyReducer(state, { type: "undo" });
    state = historyReducer(state, { type: "change", room: { ...first, name: "새 공간" } });
    expect(state.future).toEqual([]);
    expect(historyReducer(state, { type: "reset", room: first })).toEqual({ past: [], present: first, future: [] });
  });

  test("continuous slider previews commit once and undo/redo as one gesture", () => {
    const first = createInitialRoom();
    let state = { past: [], present: first, future: [] };
    for (const ambient of [95, 90, 85, 80, 75]) {
      state = historyReducer(state, { type: "preview", room: { ...first, atmosphere: { ...first.atmosphere, ambient } } });
    }
    expect(state.past).toHaveLength(0);
    const last = state.present;
    state = historyReducer(state, { type: "commit", before: first });
    expect(state.past).toEqual([first]);
    expect(state.present.atmosphere.ambient).toBe(75);
    state = historyReducer(state, { type: "undo" });
    expect(state.present).toEqual(first);
    state = historyReducer(state, { type: "redo" });
    expect(state.present).toEqual(last);
  });

  test("no-op changes and reverted slider gestures preserve redo history", () => {
    const first = createInitialRoom();
    const next = { ...first, name: "새 이름" };
    let state = { past: [], present: first, future: [next] };
    expect(historyReducer(state, { type: "change", room: { ...first, atmosphere: { ...first.atmosphere } } })).toBe(state);
    state = historyReducer(state, { type: "preview", room: next });
    state = historyReducer(state, { type: "preview", room: first });
    expect(historyReducer(state, { type: "commit", before: first })).toBe(state);
    expect(state.future).toEqual([next]);
    state = historyReducer(state, { type: "preview", room: { ...first, name: "다른 이름" } });
    state = historyReducer(state, { type: "commit", before: first });
    expect(state.future).toEqual([]);
  });

  test("committed slider gestures keep at most 40 undo snapshots", () => {
    let state = { past: [], present: createInitialRoom(), future: [] };
    for (let index = 0; index < 45; index += 1) {
      const before = state.present;
      state = historyReducer(state, { type: "preview", room: { ...before, name: `공간 ${index}` } });
      state = historyReducer(state, { type: "commit", before });
    }
    expect(state.past).toHaveLength(40);
    expect(state.present.name).toBe("공간 44");
  });
});

describe("climbing-specific floors and migration", () => {
  test("ground and mezzanine furniture share coordinates without colliding across floors", () => {
    const ground = { id: "ground", kind: "table", x: 4.5, z: -10, rotation: 0 };
    const upper = { ...ground, id: "upper", level: 1 };
    expect(canPlace(ground, [upper], "climbing")).toBe(true);
    expect(canPlace(upper, [ground], "climbing")).toBe(true);
    expect(canPlace({ ...upper, id: "duplicate" }, [upper], "climbing")).toBe(false);
    expect(canPlace(upper, [], "lounge")).toBe(false);
    expect(canPlace({ ...upper, x: 0 }, [], "climbing")).toBe(false);
  });

  test("new upper-floor furniture stays on the deck and preserves stairs and landing", () => {
    const deck = getRoomLayout("climbing").mezzanine;
    const headroom = getRoomLayout("climbing").building.height - deck.height;
    for (const { kind } of CATALOG.filter(({ height = 0, width, depth }) => height <= headroom && width < 7 && depth < 5.5)) {
      const position = findOpenPosition(kind, [], "climbing", "mezzanine");
      expect(position).toMatchObject({ level: 1 });
      expect(canPlace({ ...position, kind, rotation: 0 }, [], "climbing")).toBe(true);
    }
    for (const kind of ["table", "rug"]) {
      expect(canPlace({ kind, x: 8.6, z: 0, rotation: 0 }, [], "climbing")).toBe(false);
    }
    expect(canPlace({ kind: "stool", x: 8.6, z: -3.6, rotation: 0, level: 1 }, [], "climbing")).toBe(false);
    const loft = createInitialRoom("lounge", { loungeLoft: true });
    expect(findOpenPosition("stool", [], loft, "mezzanine")).toMatchObject({ level: 1 });
    expect(findOpenPosition("stool", [], { ...loft, version: 11 }, "mezzanine")).toBeNull();
    expect(findOpenPosition("stool", [], "band", "mezzanine")).toMatchObject({ level: 1 });
  });

  test("version 4 climbing saves relocate only new conflicts while preserving records and settings", () => {
    const photo = "data:image/jpeg;base64,YWJj";
    const old = { ...createInitialRoom("climbing"), version: 4, theme: "sage", matColor: "#7b9b6d", name: "높이 함께",
      coverPhoto: photo, notice: "토요일에 만나요", atmosphere: { ...DEFAULT_ATMOSPHERE, lamps: 42 }, items: [
        { id: "stable", kind: "bench", x: -7, z: 10, rotation: 0 },
        { id: "new-stairs", kind: "sofa", x: 7, z: 3.7, rotation: 0 },
        { id: "new-mat", kind: "memory", x: -6, z: 0, rotation: 0, title: "첫 완등", note: "기억", photo, link: "https://example.com/memory" }
      ] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const { room, warning } = loadRoom(storage);
    expect(warning).toBe("");
    expect(room).toMatchObject({ version: 10, name: old.name, coverPhoto: photo, notice: old.notice, atmosphere: old.atmosphere });
    expect(room.matColor).toBe(old.matColor);
    expect(room.items[0]).toMatchObject({ id: old.items[0].id, kind: old.items[0].kind });
    expect(room.items[1]).not.toMatchObject({ x: 7, z: 3.7 });
    expect(room.items[2]).toMatchObject({ id: "new-mat", title: "첫 완등", note: "기억", photo, link: "https://example.com/memory" });
    expect(validateRoom(room)).toEqual(room);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(old.items[1].x).toBe(7);
  });

  test("invalid version 4 geometry is rejected before migration can repair it", () => {
    const base = { ...createInitialRoom("climbing"), version: 4, theme: "sage" };
    for (const item of [
      { id: "old-wall", kind: "stool", x: 4, z: 0, rotation: 0 },
      { id: "old-facility", kind: "stool", x: -6, z: -6, rotation: 0 },
      { id: "invented-level", kind: "stool", x: 7, z: -6, rotation: 0, level: 1 }
    ]) expect(validateRoom({ ...base, items: [item] })).toBeNull();
  });

  test("upper-floor records survive storage and return to ground when changing template", () => {
    const record = { id: "upper-record", kind: "memory", x: 6.5, z: -10, level: 1, rotation: 0,
      title: "함께 오른 날", note: "사진", photo: "", link: "" };
    const room = { ...createInitialRoom("climbing"), items: [record] };
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    saveRoom(storage, room);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(loadRoom(storage).room).toEqual(room);
    const next = applyRoomTemplate(room, "lounge");
    expect(next.items.find(({ id }) => id === record.id)).toMatchObject({ title: record.title, level: 0 });
    expect(validateRoom(next)).toEqual(next);
  });

  test.each([-1, 2, 0.5, "1", NaN])("rejects invalid item level %s", (level) => {
    const room = createInitialRoom("climbing");
    expect(validateRoom({ ...room, items: [{ ...room.items[0], level }] })).toBeNull();
  });
});

test("explicit climbing template selection installs muted mats and reference lighting while preserving personal accent", () => {
  const room = { ...createInitialRoom(), matColor: "#7b9b6d", accentColor: "#c991ba",
    atmosphere: { ...DEFAULT_ATMOSPHERE, lamps: 73 } };
  const next = applyRoomTemplate(room, "climbing");
  expect(next.matColor).toBe(createInitialRoom("climbing").matColor);
  expect(next.matColor).not.toBe(room.matColor);
  expect(next.accentColor).toBe(room.accentColor);
  expect(next.atmosphere).toEqual(TEMPLATE_ATMOSPHERES.climbing);
});


describe("reference room version 6", () => {
  test("version 5 climbing placements migrate to the smaller hall without losing custom data or upper level", () => {
    const old = { ...createInitialRoom("climbing"), version: 5, name: "지난 암장", matColor: "#536bd6",
      atmosphere: { ...DEFAULT_ATMOSPHERE, lamps: 73, backgroundColor: "#abcdef" },
      items: [
        { id: "stable-yard", kind: "bench", x: -6.5, z: 10, rotation: 0 },
        { id: "upper-record", kind: "memory", x: 9, z: -5.5, rotation: 0, level: 1, title: "완등", note: "우리 기록", photo: "data:image/png;base64,YWJj", link: "https://example.com/record" },
        { id: "ground-table", kind: "table", x: 4.3, z: -4.1, rotation: 0 }
      ] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const { room, warning } = loadRoom(storage);
    expect(warning).toBe("");
    expect(room.version).toBe(10);
    expect(room.name).toBe(old.name);
    expect(room.atmosphere).toEqual(old.atmosphere);
    expect(room.matColor).toBe(old.matColor);
    expect(room.items[0]).toMatchObject({ id: old.items[0].id, kind: old.items[0].kind });
    expect(room.items[1]).toMatchObject({ id: "upper-record", level: 1, title: "완등", note: "우리 기록", photo: old.items[1].photo, link: old.items[1].link });
    expect(room.items[1].x).not.toBe(10);
    expect(validateRoom(room)).toEqual(room);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("version 5 invalid old geometry and invented boardgame templates are rejected before migration", () => {
    const old = { ...createInitialRoom("climbing"), version: 5 };
    expect(validateRoom({ ...old, items: [{ id: "old-stairs", kind: "table", x: 8.6, z: 0, rotation: 0 }] })).toBeNull();
    expect(validateRoom({ ...createInitialRoom("boardgame"), version: 5 })).toBeNull();
  });

  test("boardgame upper furnishings persist and changing theme relocates upper memories safely", () => {
    const room = createInitialRoom("boardgame");
    const position = findOpenPosition("memory", room.items, "boardgame", "mezzanine");
    expect(position).toMatchObject({ level: 1 });
    room.items.push({ id: "upper-photo", kind: "memory", rotation: 0, ...position, title: "함께한 게임", note: "", photo: "", link: "" });
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    saveRoom(storage, room);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(loadRoom(storage)).toEqual({ room, warning: "" });
    const next = applyRoomTemplate(room, "climbing");
    expect(next.items.find((entry) => entry.id === "upper-photo")).toMatchObject({ title: "함께한 게임" });
    expect(next.atmosphere).toEqual(TEMPLATE_ATMOSPHERES.climbing);
    expect(validateRoom(next)).toEqual(next);
  });
});


test("the lounge preserves custom atmosphere and the four reference presets apply their own light settings", () => {
  const room = { ...createInitialRoom(), atmosphere: { ...DEFAULT_ATMOSPHERE, sunlight: 55, backgroundColor: "#aabbcc" } };
  expect(applyRoomTemplate(room, "lounge").atmosphere).toEqual(room.atmosphere);
  for (const template of ["dining", "band", "study", "photo"]) expect(applyRoomTemplate(room, template).atmosphere).toEqual(TEMPLATE_ATMOSPHERES[template]);
});


test("front library reserves real shelf space while the visible booth leaves the main aisle clear", () => {
  const room = createInitialRoom("boardgame");
  expect(room.items.find((entry) => entry.id === "booth-back")).toMatchObject({ x: 5, z: -6.2 });
  expect(room.items.find((entry) => entry.id === "booth-table")).toMatchObject({ x: 5, z: -3.2 });
  expect(canPlace({ kind: "gameChair", x: -2.3, z: -9.8, rotation: 0 }, room.items, "boardgame")).toBe(false);
  expect(canPlace({ kind: "gameChair", x: -2.3, z: -9.8, rotation: 0 }, [], "boardgame")).toBe(true);
  expect(canPlace({ kind: "gameChair", x: -2.3, z: -8.2, rotation: 0 }, [], "boardgame")).toBe(true);
  expect(validateRoom(room)).toEqual(room);
});


test("climbing lounge sits in front of the deck with a legal rug and clear stair approach", () => {
  const room = createInitialRoom("climbing");
  expect(room.items.find((entry) => entry.id === "lounge-sofa")).toMatchObject({ x: 5.2, z: -0.7 });
  expect(room.items.find((entry) => entry.id === "lounge-table")).toMatchObject({ x: 5.2, z: 1.6 });
  expect(room.items.find((entry) => entry.id === "lounge-rug")).toMatchObject({ kind: "loungeRug", x: 4.9, z: -0.2 });
  for (const item of room.items) expect(canPlace(item, room.items, room.template)).toBe(true);
  expect(validateRoom(room)).toEqual(room);
});


describe("expanded reference rooms version 7", () => {
  test("boardgame includes distinct loft seating groups and preserves individual upholstery colors", () => {
    const room = createInitialRoom("boardgame");
    const ground = room.items.filter((item) => !item.level);
    expect(ground.filter((item) => item.kind === "roundChair")).toHaveLength(4);
    expect(ground.filter((item) => item.kind === "clubSofa")).toHaveLength(3);
    expect(room.items.find((item) => item.id === "upper-lounge-table")).toMatchObject({ level: 1, kind: "coffeeTable" });
    expect(room.items.find((item) => item.id === "upper-round-table")).toMatchObject({ level: 1, kind: "cafeTable" });
    expect(room.items.find((item) => item.id === "loft-game-2")).toMatchObject({ level: 1, kind: "gameTable" });
    expect(room.items.filter((item) => item.level === 1 && item.kind === "gameChair")).toHaveLength(6);
    expect(room.items.filter((item) => item.z > 5).length).toBeGreaterThanOrEqual(3);
    expect(new Set(ground.filter((item) => ["roundChair", "beanbag"].includes(item.kind)).map((item) => item.color)).size).toBe(6);
    expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
    const invalid = { ...room, items: [{ ...room.items[0], color: "red; background: url(x)" }] };
    expect(validateRoom(invalid)).toBeNull();
  });

  test("version 6 uses the old table footprint for both bounds and furniture overlap before migration", () => {
    const old = { ...createInitialRoom("boardgame"), version: 6, name: "우리 게임방",
      atmosphere: { ...DEFAULT_ATMOSPHERE, ambient: 37 }, items: [
        { id: "old-table", kind: "gameTable", x: -1.2, z: 0.5, rotation: 0, color: "#345678" },
        { id: "old-chair", kind: "gameChair", x: 1.1, z: 0.5, rotation: 3 },
        { id: "upper-record", kind: "memory", x: 3.7, z: -6.6, rotation: 0, level: 1,
          title: "첫 게임", note: "함께", photo: "data:image/png;base64,YWJj", link: "https://example.com/game" }
      ] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const { room, warning } = loadRoom(storage);
    expect(warning).toBe("");
    expect(room).toMatchObject({ version: 10, name: old.name, atmosphere: old.atmosphere });
    expect(room.items).toHaveLength(old.items.length + createLegacyFacilityItems("boardgame").length);
    expect(room.items[0]).toMatchObject({ id: "old-table", color: "#345678" });
    expect(room.items[2]).toMatchObject({ id: "upper-record", level: 1, title: "첫 게임", photo: old.items[2].photo });
    expect(validateRoom(room)).toEqual(room);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(validateRoom({ ...old, items: [{ ...old.items[0], x: 9 }] })).toBeNull();
    expect(validateRoom({ ...old, items: [old.items[0], { ...old.items[1], x: 0.5 }] })).toBeNull();
  });

  test("version 6 climbing records move away from new equipment without losing photos or their floor", () => {
    const record = { id: "record", kind: "memory", x: 4.5, z: -5.2, rotation: 0,
      color: "#abcdef", title: "완등", note: "사진", photo: "data:image/png;base64,YWJj", link: "" };
    const old = { ...createInitialRoom("climbing"), version: 6, items: [record, { ...record, id: "upper", level: 1 }] };
    const room = validateRoom(old);
    expect(room.version).toBe(10);
    expect(room.items).toHaveLength(2 + createLegacyFacilityItems("climbing").length);
    expect(room.items[0]).toMatchObject({ id: "record", title: record.title, color: record.color, photo: record.photo });
    expect(room.items[1]).toMatchObject({ id: "upper", level: 1, photo: record.photo });
    expect(validateRoom(room)).toEqual(room);
    expect(validateRoom({ ...old, items: [{ ...record, x: 8.5, z: 0 }] })).toBeNull();
  });
});


describe("version 8 entrance corridor", () => {
  test.each(ROOM_TEMPLATES.map(({ id }) => id))("%s defaults preserve the interior and replace the yard with three entrance furnishings", (template) => {
    const room = createInitialRoom(template);
    const layout = getRoomLayout(template);
    expect(layout.entrance).toEqual({ minX: layout.building.minX, maxX: layout.building.maxX, minZ: 5, maxZ: 8.2 });
    expect(layout.yard.maxZ).toBeGreaterThan(layout.entrance.maxZ + 6);
    expect(layout.street).toBeUndefined();
    expect(PLAYER.spawn).toEqual({ x: -2, z: 6.8 });
    expect(room.items.filter((item) => item.z > 5).length).toBeGreaterThanOrEqual(3);
    expect(room.items.some((item) => item.id.startsWith("yard-"))).toBe(false);
    expect(validateRoom(room)).toEqual(room);
    expect(findOpenPosition("stool", room.items, template, "entrance").z).toBeGreaterThan(5);
    expect(findOpenPosition("stool", room.items, template, "yard").z).toBeGreaterThan(8.2);
  });

  test.each(["climbing", "boardgame"])("all v7 %s interior and yard furniture survive relocation", (template) => {
    const room = previousRooms[template];
    const yard = [
      { id: "yard-bench", kind: "bench", x: -6.5, z: 10, rotation: 0 },
      { id: "yard-table", kind: "table", x: 4.8, z: 8.5, rotation: 0 },
      { id: "yard-seat1", kind: "stool", x: 4.8, z: 7, rotation: 0 },
      { id: "yard-seat2", kind: "stool", x: 4.8, z: 10, rotation: 0 },
      { id: "yard-plant1", kind: "plant", x: -9, z: 6.5, rotation: 0 },
      { id: "yard-plant2", kind: "plant", x: 9, z: 11, rotation: 0 },
      { id: "yard-memory", kind: "memory", x: 1, z: 11, rotation: 1, color: "#abcdef",
        title: "우리 추억", note: "남겨 둔 사진", photo: "data:image/png;base64,YWJj", link: "https://example.com/record" }
    ];
    // Version 7 predates the reference furnishings added beside the movable v9 facilities.
    const inside = room.items.filter((item) => !item.id.startsWith("entrance-") && !item.id.startsWith("facility-") && !item.id.startsWith("reference-"));
    const old = { ...room, version: 7, name: "우리의 방", items: [...inside, ...yard] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const result = loadRoom(storage);
    expect(result.warning).toBe("");
    expect(result.room.version).toBe(10);
    expect(result.room.items).toHaveLength(old.items.length + createLegacyFacilityItems(template).length);
    for (const item of inside) expect(result.room.items.find((entry) => entry.id === item.id)).toMatchObject({ ...item, x: expect.any(Number), z: expect.any(Number) });
    expect(result.room.name).toBe(old.name);
    expect(result.room.atmosphere).toEqual(old.atmosphere);
    for (const item of yard) {
      expect(result.room.items.find((entry) => entry.id === item.id)).toMatchObject({ ...item,
        x: expect.any(Number), z: expect.any(Number) });
    }
    expect(result.room.items.every((item) => canPlace(item, result.room.items, result.room))).toBe(true);
    expect(validateRoom(result.room)).toEqual(result.room);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(validateRoom({ ...old, items: [{ ...yard[0], x: 12 }] })).toBeNull();
  });

  test.each([4, 5, 6, 7])("version %s validates the old yard boundary before relocating furniture", (version) => {
    const old = { ...createInitialRoom(), version, items: [
      { id: "outer-plant", kind: "plant", x: 10.4, z: 11, rotation: 0 },
      { id: "bench", kind: "bench", x: -7, z: 10, rotation: 0 }
    ] };
    const room = validateRoom(old);
    expect(room.version).toBe(10);
    expect(room.items.filter((item) => !item.id.startsWith("facility-")).map((item) => item.id)).toEqual(["outer-plant", "bench"]);
    expect(validateRoom(room)).toEqual(room);
    expect(validateRoom({ ...old, items: [{ ...old.items[0], x: 11 }] })).toBeNull();
  });
});

describe("version 9 reusable facilities", () => {
  test.each(["lounge", "climbing", "boardgame", "dining", "band"])("v8 %s keeps existing items and settings while materializing its former fixed facilities", (template) => {
    const position = template === "climbing" ? { x: 4.4, z: -1.2 } : { x: -5.4, z: -2.4 };
    const recordPosition = template === "climbing" ? { x: 3, z: -7 } : template === "boardgame" ? { x: 6, z: -6.2 } : { x: 1, z: 0 };
    const old = { ...createInitialRoom(template), version: 8, name: "우리의 원래 아지트", coverPhoto: "data:image/png;base64,YWJj",
      notice: "금요일에 만나요", atmosphere: { ...DEFAULT_ATMOSPHERE, warmth: 64, lamps: 83 }, items: [
        { id: "custom-chair", kind: "armchair", ...position, rotation: 0, color: "#a08060" },
        { id: "our-memory", kind: "memory", ...recordPosition, rotation: 0, title: "첫 모임", note: "함께 남긴 기록",
          photo: "data:image/jpeg;base64,YWJj", link: "https://example.com/our-record" }
      ] };
    const storage = { getItem: () => JSON.stringify(old), setItem: jest.fn() };
    const { room, warning } = loadRoom(storage);
    expect(warning).toBe("");
    expect(room).toMatchObject({ version: 10, name: old.name, coverPhoto: old.coverPhoto, notice: old.notice, atmosphere: old.atmosphere });
    for (const original of old.items) expect(room.items.find((item) => item.id === original.id)).toEqual(original);
    expect(room.items.length).toBeGreaterThan(old.items.length);
    expect(new Set(room.items.map((item) => item.id)).size).toBe(room.items.length);
    expect(room.items.filter((item) => !canPlace(item, room.items, room))).toEqual([]);
    expect(validateRoom(room)).toEqual(room);
    expect(storage.setItem).not.toHaveBeenCalled();
    if (["dining", "band"].includes(template)) expect(room.items.some((item) => CATALOG.find((asset) => asset.kind === item.kind)?.collection === template)).toBe(true);
  });

  test("moving, rotating and deleting library units survives save without respawning preset fixtures", () => {
    const room = createInitialRoom("boardgame");
    const [removed, movable] = room.items.filter((item) => item.kind === "openDisplayShelf");
    const others = room.items.filter((item) => ![removed.id, movable.id].includes(item.id) && ![removed.id, movable.id].includes(item.parentId));
    const position = findOpenPosition(movable.kind, others, "boardgame", "building", 1);
    expect(position).not.toBeNull();
    const moved = { ...movable, ...position, rotation: 1, color: "#845b42" };
    const movedGroup = transformAttachedItems(room.items, movable.id, moved).filter(item => item.parentId === movable.id);
    const edited = { ...room, items: [...others, moved, ...movedGroup] };
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    saveRoom(storage, edited);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    const loaded = loadRoom(storage);
    expect(loaded).toEqual({ room: edited, warning: "" });
    expect(loaded.room.items.some((item) => item.id === removed.id)).toBe(false);
    expect(loaded.room.items.find((item) => item.id === movable.id)).toEqual(moved);
    expect(validateRoom(loaded.room)).toEqual(edited);
  });

  test.each(["study", "photo"])("rejects invented pre-v9 %s rooms before migrating them", (template) => {
    const room = { ...createInitialRoom(template), items: [] };
    for (const version of [1, 4, 6, 7, 8]) expect(validateRoom({ ...room, version })).toBeNull();
  });

  test.each(["dining", "band"])("rejects an invented v8 %s mezzanine while accepting a real v9 mezzanine", (template) => {
    const current = createInitialRoom(template);
    const upper = current.items.find((item) => item.level === 1 && ["table", "gameChair", "bookshelf"].includes(item.kind));
    expect(upper).toBeDefined();
    expect(validateRoom({ ...current, items: [upper] })).not.toBeNull();
    expect(validateRoom({ ...current, version: 8, items: [upper] })).toBeNull();
  });
});


test("raised ceilings accept a supported shelf but still reject partial overlap regardless of item order", () => {
  const stage = { id: "stage", kind: "rehearsalStage", x: 3, z: -8.5, rotation: 0 };
  const shelf = { id: "shelf", kind: "libraryShelfWood", x: 3, z: -8.5, rotation: 0 };
  const seat = { id: "seat", kind: "stool", x: 5.9, z: -8.5, rotation: 0 };
  expect(canPlace(shelf, [], "boardgame")).toBe(true);
  expect(canPlace(shelf, [stage], "boardgame")).toBe(true);
  expect(canPlace(stage, [shelf], "boardgame")).toBe(true);
  expect(canPlace(seat, [stage], "boardgame")).toBe(false);
  expect(canPlace(stage, [seat], "boardgame")).toBe(false);
  for (const items of [[stage, shelf], [shelf, stage]]) {
    expect(validateRoom({ ...createInitialRoom("boardgame"), items })).not.toBeNull();
  }
});

test.each(["dining", "band"])("legacy %s retains a visible editable board for its identity", (template) => {
  const previous = { ...createInitialRoom(template), version: 8, theme: "wood", items: [],
    notice: "다음 모임에서 만나요", coverPhoto: "data:image/jpeg;base64,YWJj" };
  const migrated = validateRoom(previous);
  expect(migrated).toMatchObject({ notice: previous.notice, coverPhoto: previous.coverPhoto });
  expect(migrated.items.filter((item) => item.kind === "clubPinboard")).toHaveLength(1);
  expect(validateRoom(migrated)).toEqual(migrated);
});

describe("expanded island preserves the original entrance", () => {
  test.each(ROOM_TEMPLATES.map(({ id }) => id))("%s can save furniture on every side of its lawn without changing existing items or settings", (template) => {
    const original = createInitialRoom(template);
    const { building, island } = getRoomLayout(template);
    const outdoor = [
      { id: "front-bench", kind: "bench", x: 4, z: building.maxZ + 7, rotation: 0 },
      { id: "left-bench", kind: "bench", x: building.minX - 2, z: 0, rotation: 1 },
      { id: "right-bench", kind: "bench", x: building.maxX + 2, z: 0, rotation: 1 },
      { id: "rear-bench", kind: "bench", x: 0, z: building.minZ - 2, rotation: 0 }
    ];
    const room = { ...original, notice: "마당에서 만나요", atmosphere: { ...original.atmosphere, warmth: 61 }, items: [...original.items, ...outdoor] };
    for (const item of outdoor) expect(canPlace(item, room.items, template)).toBe(true);
    expect(canPlace({ ...outdoor[0], z: island.walkable.maxZ }, room.items, template)).toBe(false);
    expect(canPlace({ ...outdoor[0], x: -2, z: building.maxZ + 1 }, room.items, template)).toBe(false);
    const storage = { setItem: jest.fn(), getItem: jest.fn() };
    saveRoom(storage, room);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0][1]);
    expect(loadRoom(storage)).toEqual({ room, warning: "" });
    expect(room.items.slice(0, original.items.length)).toEqual(original.items);
    // The same coordinates were outside v8's compact entrance and remain invalid as old input.
    expect(validateRoom({ ...original, version: 8, items: [outdoor[0]] })).toBeNull();
  });

});

test.each([8, 9, 10, 11])("v%s preserves fixed weather and materials through validation and preset switching", version => {
  const outdoors = { mode: "fixed", phase: "night", weather: "snow" };
  const initial = createInitialRoom("lounge");
  const room = { ...initial, version, items: [], atmosphere: { ...initial.atmosphere,
    outdoors, wallMaterial: "auto", floorMaterial: "auto", wallPatternScale: 1.5, floorPatternScale: 0.75 } };
  const validated = validateRoom(room);
  expect(validated.version).toBe(Math.max(10, version));
  expect(validated.atmosphere).toEqual(room.atmosphere);
  const next = applyRoomTemplate(validated, "boardgame");
  expect(next.atmosphere.outdoors).toEqual(outdoors);
  expect(validateRoom(next)).toEqual(next);
});

test("v9 saved lawn furniture and weather survive migration and reload without automatic storage writes", () => {
  const initial = createInitialRoom("lounge");
  const room = { ...initial, version: 9, items: [
    { id: "saved-lawn-bench", kind: "bench", x: 4, z: 12, rotation: 0 }
  ], atmosphere: { ...initial.atmosphere, outdoors: { mode: "fixed", phase: "dusk", weather: "rain" } } };
  const storage = { getItem: () => JSON.stringify(room), setItem: jest.fn() };
  const loaded = loadRoom(storage);
  expect(loaded.warning).toBe("");
  expect(loaded.room.items).toEqual(room.items);
  expect(loaded.room.atmosphere).toEqual(room.atmosphere);
  expect(loaded.room.version).toBe(10);
  expect(validateRoom(loaded.room)).toEqual(loaded.room);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test("the saved lounge version controls the layout, even when all upper-floor furniture has been removed", () => {
  const legacy = createInitialRoom("lounge", { loungeLoft: false });
  const loft = createInitialRoom("lounge", { loungeLoft: true });
  const emptyLoft = { ...loft, items: loft.items.filter(({ level }) => level !== 1) };
  expect(validateRoom(legacy)).toEqual(legacy);
  expect(getRoomLayout(legacy).mezzanine).toBeUndefined();
  expect(validateRoom(loft)).toEqual(loft);
  expect(validateRoom(emptyLoft)).toEqual(emptyLoft);
  expect(getRoomLayout(emptyLoft).mezzanine).toBeDefined();
  expect(validateRoom({ ...loft, version: legacy.version })).toBeNull();
});
