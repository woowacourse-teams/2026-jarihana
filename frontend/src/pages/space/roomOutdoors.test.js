import { createInitialRoom, validateRoom } from "./roomState.js";
import { fixedOutdoors, liveOutdoors } from "./roomOutdoors.js";

const report = { sunrise: "2026-11-09T07:04", sunset: "2026-11-09T17:26", weatherCode: 63 };

test.each([
  ["2026-11-08T21:10:00Z", "night"],
  ["2026-11-08T22:04:00Z", "dawn"],
  ["2026-11-09T00:00:00Z", "day"],
  ["2026-11-09T08:14:00Z", "dusk"],
  ["2026-11-09T12:00:00Z", "night"]
])("uses the Seoul day and today's sunrise and sunset at %s", (time, phase) => {
  expect(liveOutdoors(new Date(time), report)).toMatchObject({ phase, weather: "rain", status: "current" });
});

test("sun progress advances through the day independently of the viewer's time zone", () => {
  const morning = liveOutdoors(new Date("2026-11-09T00:00:00Z"), report);
  const afternoon = liveOutdoors(new Date("2026-11-09T06:00:00Z"), report);
  expect(morning.daylightProgress).toBeLessThan(afternoon.daylightProgress);
});

test.each([[0, "clear"], [3, "cloudy"], [45, "cloudy"], [95, "rain"], [85, "snow"]])(
  "translates provider code %i into %s and marks cached conditions", (weatherCode, weather) => {
    expect(liveOutdoors(new Date("2026-11-09T02:00:00Z"), { ...report, weatherCode, stale: true }))
      .toMatchObject({ weather, status: "stale" });
  }
);

test("continues to update the time without using yesterday's weather", () => {
  expect(liveOutdoors(new Date("2026-11-10T04:00:00Z"), report))
    .toMatchObject({ phase: "day", weather: "clear", status: "unavailable" });
});

test("persists an explicit choice while keeping the effective preview outside the room document", () => {
  const room = createInitialRoom();
  expect(validateRoom(room).atmosphere).not.toHaveProperty("outdoors");
  const outdoors = { mode: "fixed", phase: "night", weather: "snow" };
  const preview = { ...room, atmosphere: { ...room.atmosphere, outdoors, outdoorLight: fixedOutdoors(outdoors) } };
  const saved = validateRoom(preview);
  expect(saved.atmosphere.outdoors).toEqual(outdoors);
  expect(saved.atmosphere).not.toHaveProperty("outdoorLight");
  expect(validateRoom({ ...room, atmosphere: { ...room.atmosphere, outdoors: { ...outdoors, phase: "morning" } } })).toBeNull();
  expect(validateRoom({ ...room, atmosphere: { ...room.atmosphere, outdoors: { ...outdoors, phase: ["night"] } } })).toBeNull();
});
