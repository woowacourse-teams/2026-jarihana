import { COMMON_FUNCTION_ASSETS, commonAssetStatus } from "./commonFunctionAssets";
import { featureForRoomItem } from "./clubhouseInteractions";
import { applyRoomTemplate, canPlace, createInitialRoom, MAX_ITEMS, restoreCommonFunctionAssets, ROOM_TEMPLATES, validateRoom } from "./roomState";

test.each(ROOM_TEMPLATES.map(({ id }) => id))("%s starts with the same functional entrances in valid walkable placements", (template) => {
  const room = createInitialRoom(template);
  expect(validateRoom(room)).toEqual(room);
  for (const status of commonAssetStatus(room.items)) {
    expect(status.items).toHaveLength(1);
    expect(featureForRoomItem(status.items[0])).toBe(status.feature);
    expect(canPlace(status.items[0], room.items, template)).toBe(true);
  }
});

test("repair adds only missing entrances without moving, duplicating or changing existing data", () => {
  const room = createInitialRoom("boardgame");
  room.notice = "토요일 오후에 만나요";
  room.items = room.items.filter((item) => item.kind !== "clubDashboard" && item.kind !== "activityBoard");
  const renamedId = room.items[0].id;
  room.items = room.items.map((item) => ({ ...item,
    ...(item.id === renamedId ? { id: "common-clubDashboard" } : {}),
    ...(item.parentId === renamedId ? { parentId: "common-clubDashboard" } : {}) }));
  expect(validateRoom(room)).toEqual(room);
  const before = JSON.parse(JSON.stringify(room));
  const restored = restoreCommonFunctionAssets(room);
  expect(room).toEqual(before);
  expect(restored.items.slice(0, before.items.length)).toEqual(before.items);
  expect(restored.notice).toBe(before.notice);
  expect(new Set(restored.items.map((item) => item.id)).size).toBe(restored.items.length);
  expect(restoreCommonFunctionAssets(restored)).toBe(restored);
  expect(validateRoom(restored)).toEqual(restored);
});

test("removing an entrance stays removed on reload while notice remains and a new preset restores entrances", () => {
  const room = createInitialRoom();
  room.notice = "모임 공지";
  room.items = room.items.filter((item) => item.kind !== "clubDashboard");
  const saved = validateRoom(room);
  expect(saved.items.some((item) => item.kind === "clubDashboard")).toBe(false);
  expect(saved.notice).toBe("모임 공지");
  const changed = applyRoomTemplate(saved, "photo");
  expect(commonAssetStatus(changed.items).every((entry) => entry.items.length > 0)).toBe(true);
  expect(changed.notice).toBe(saved.notice);
});

test("capacity failure does not partially change a room", () => {
  const room = createInitialRoom();
  room.items = Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `existing-${i}`, kind: "plant", x: 0, z: 0, rotation: 0 }));
  const before = JSON.stringify(room);
  expect(() => restoreCommonFunctionAssets(room)).toThrow("공통 에셋을 놓을 자리가 부족");
  expect(JSON.stringify(room)).toBe(before);
});

test("common entrances have one stable mapping and legacy photos retain activity shortcuts", () => {
  expect(COMMON_FUNCTION_ASSETS.map((entry) => featureForRoomItem({ kind: entry.kind }))).toEqual(["dashboard", "activities", "music"]);
  for (const kind of ["memory", "clubPinboard", "gameWallBoard", "climbingBoard"]) expect(featureForRoomItem({ kind })).toBe("activities");
});
