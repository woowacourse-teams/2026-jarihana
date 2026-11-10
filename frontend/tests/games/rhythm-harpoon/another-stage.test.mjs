import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEVELS, noteColor } from "../../../src/features/game/rhythm/engine.mjs";
import { createPracticeRun } from "../../../src/features/game/rhythm/practice-session.mjs";
import { readPracticeSettings } from "../../../src/features/game/rhythm/preferences.mjs";
import { createRankedEngine } from "../../../src/features/game/rhythm/ranked-run.mjs";

const swingChart = JSON.parse(
  readFileSync(
    new URL("../../../public/game-assets/rhythm-harpoon/assets/swing-chart.json", import.meta.url),
    "utf8"
  )
);
const KEY = { left: "a", down: "s", right: "d", up: "w" };

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function keysInBars(engine, loop, firstBar, lastBar) {
  return engine.notes
    .filter(
      (note) =>
        note.loop === loop &&
        note.step >= (firstBar - 1) * 16 - 0.000001 &&
        note.step < lastBar * 16 - 0.000001
    )
    .map((note) => KEY[note.lane])
    .join("");
}

test("ANOTHER plays the swing chart as written with Hardest lives, healing and speed-up", () => {
  const engine = createPracticeRun(swingChart, { level: "another" }).engine;
  assert.equal(engine.sourceEvents.length, swingChart.events.length);
  assert.equal(engine.maxLives, 10);
  assert.equal(engine.loopHeal, 5);
  while (engine.loops.length < 7) engine.appendNextLoop();
  assert.deepEqual(
    engine.loops.map((loop) => loop.rate),
    [1, 1, 1, 1, 1, 1.05, 1.1]
  );
  assert.equal(keysInBars(engine, 1, 39, 40), "awdawdasdasdawdasdawdasd");
  assert.equal(keysInBars(engine, 1, 48, 48), "awdawdawdawd");
});

test("ANOTHER colors germs by beat position, so swing offbeats and triplets are green", () => {
  const engine = createPracticeRun(swingChart, { level: "another" }).engine;
  const colors = new Set(engine.notes.map((note) => note.color));
  assert.deepEqual([...colors].sort(), [0, 3]);
  for (const note of engine.notes) assert.equal(note.color, noteColor(note.step));
});

test("ANOTHER rotates stairs whole and only repeats a lane within 200ms in bars 41 and 42", () => {
  for (let seed = 1; seed <= 120; seed++) {
    const engine = createPracticeRun(swingChart, { level: "another" }).engine;
    engine.random = seeded(seed);
    while (engine.loops.length < 8) engine.appendNextLoop();
    for (const loop of engine.loops.slice(1)) {
      // 레인 순서(left, down, right, up)로 a, w, d는 0, 3, 2다. 통째로 돌리면 첫 노트만큼 밀린 같은 모양이다.
      const lanes = [...keysInBars(engine, loop.number, 48, 48)].map((key) => "asdw".indexOf(key));
      assert.deepEqual(
        lanes.map((lane) => (lane - lanes[0] + 4) % 4),
        [0, 3, 2, 0, 3, 2, 0, 3, 2, 0, 3, 2],
        "seed " + seed + " loop " + loop.number
      );
    }
    const last = {};
    for (const note of [...engine.notes].sort((a, b) => a.at - b.at)) {
      const previous = last[note.lane];
      if (previous && (note.at - previous.at) * note.rate < 0.2) {
        const bar = Math.floor(note.step / 16) + 1;
        assert.equal(previous.loop, note.loop, "loop boundary jack, seed " + seed);
        assert.ok(bar === 41 || bar === 42, "unexpected jack in bar " + bar + ", seed " + seed);
      }
      last[note.lane] = note;
    }
  }
});

test("ANOTHER stays out of official challenges", () => {
  assert.equal(Object.hasOwn(LEVELS, "another"), false);
  assert.throws(
    () => createRankedEngine(swingChart, { level: "another", seed: 1, scrollSpeed: 1 }),
    RangeError
  );
});

test("a saved ANOTHER practice choice is restored", () => {
  const storage = {
    getItem: () => JSON.stringify({ level: "another", rate: 1, volume: 65 })
  };
  assert.equal(readPracticeSettings(storage).level, "another");
});
