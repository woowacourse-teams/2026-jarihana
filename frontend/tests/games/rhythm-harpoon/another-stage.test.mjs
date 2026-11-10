import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEVELS, noteColor } from "../../../src/features/game/rhythm/engine.mjs";
import { createPracticeRun } from "../../../src/features/game/rhythm/practice-session.mjs";
import { readPracticeSettings } from "../../../src/features/game/rhythm/preferences.mjs";
import {
  RANKED_CHART_VERSION,
  RANKED_RULES_VERSION,
  assertRankedVersions,
  createRankedEngine,
  rankedChartVersion
} from "../../../src/features/game/rhythm/ranked-run.mjs";
import { stageOf } from "../../../src/features/game/rhythm/stages.mjs";

const swingChart = JSON.parse(
  readFileSync(
    new URL("../../../public/game-assets/rhythm-harpoon/assets/swing-chart.json", import.meta.url),
    "utf8"
  )
);
const ANOTHER_LEVELS = ["anotherHard", "anotherHardest"];
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

test("ANOTHER levels play their own swing charts with 10 lives and the healing and speed-up of the same name", () => {
  for (const [level, same, events] of [
    ["anotherHard", "hard", 280],
    ["anotherHardest", "hardest", 348]
  ]) {
    const engine = createPracticeRun(swingChart, { level }).engine;
    assert.equal(stageOf(level), "swing");
    assert.equal(engine.sourceEvents.length, events);
    assert.equal(engine.maxLives, 10);
    assert.equal(engine.loopHeal, LEVELS[same].loopHeal);
    assert.equal(LEVELS[level].speedUpFromLoop, LEVELS[same].speedUpFromLoop);
  }
});

test("ANOTHER stairs are written as specified: Hard never turns, Hardest turns in bars 39 and 40", () => {
  const hard = createPracticeRun(swingChart, { level: "anotherHard" }).engine;
  assert.equal(keysInBars(hard, 1, 39, 40), "awd".repeat(8));
  assert.equal(keysInBars(hard, 1, 48, 48), "awd".repeat(4));
  const hardest = createPracticeRun(swingChart, { level: "anotherHardest" }).engine;
  assert.equal(keysInBars(hardest, 1, 39, 40), "awdawdasdasdawdasdawdasd");
  assert.equal(keysInBars(hardest, 1, 48, 48), "awd".repeat(4));
});

test("ANOTHER colors germs by beat position, so swing offbeats and triplets are green", () => {
  for (const level of ANOTHER_LEVELS) {
    const engine = createPracticeRun(swingChart, { level }).engine;
    assert.deepEqual([...new Set(engine.notes.map((note) => note.color))].sort(), [0, 3]);
    for (const note of engine.notes) assert.equal(note.color, noteColor(note.step));
  }
});

test("ANOTHER rotates the bar 48 stairs whole and never repeats a lane within 200ms across a loop seam", () => {
  for (const level of ANOTHER_LEVELS) {
    for (let seed = 1; seed <= 80; seed++) {
      const engine = createPracticeRun(swingChart, { level }).engine;
      engine.random = seeded(seed);
      while (engine.loops.length < 8) engine.appendNextLoop();
      for (const loop of engine.loops.slice(1)) {
        // 레인 순서(left, down, right, up)로 a, w, d는 0, 3, 2다. 통째로 돌리면 첫 노트만큼 밀린 같은 모양이다.
        const lanes = [...keysInBars(engine, loop.number, 48, 48)].map((key) => "asdw".indexOf(key));
        assert.deepEqual(
          lanes.map((lane) => (lane - lanes[0] + 4) % 4),
          [0, 3, 2, 0, 3, 2, 0, 3, 2, 0, 3, 2],
          level + " seed " + seed + " loop " + loop.number
        );
      }
      const last = {};
      for (const note of [...engine.notes].sort((a, b) => a.at - b.at)) {
        const previous = last[note.lane];
        if (previous && (note.at - previous.at) * note.rate < 0.2) {
          const bar = Math.floor(note.step / 16) + 1;
          assert.equal(previous.loop, note.loop, level + " loop seam jack, seed " + seed);
          // 같은 레인 139ms 2연타는 Hardest의 41~42마디에만 있다.
          assert.ok(
            level === "anotherHardest" && (bar === 41 || bar === 42),
            level + " unexpected jack in bar " + bar + ", seed " + seed
          );
        }
        last[note.lane] = note;
      }
    }
  }
});

test("ANOTHER levels are official levels on the swing song with its own chart version", () => {
  for (const level of ANOTHER_LEVELS) {
    assert.equal(rankedChartVersion(level), swingChart.chartVersion);
    assert.doesNotThrow(() =>
      assertRankedVersions({ level, rulesVersion: RANKED_RULES_VERSION, chartVersion: swingChart.chartVersion })
    );
    assert.throws(() =>
      assertRankedVersions({ level, rulesVersion: RANKED_RULES_VERSION, chartVersion: RANKED_CHART_VERSION })
    );
    const engine = createRankedEngine(swingChart, { level, seed: 1, scrollSpeed: 1 });
    assert.equal(engine.sourceEvents.length, swingChart.levels[level].events.length);
  }
  assert.equal(rankedChartVersion("hardest"), RANKED_CHART_VERSION);
});

test("ANOTHER cannot be played on the original song", () => {
  const original = JSON.parse(
    readFileSync(
      new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
      "utf8"
    )
  );
  for (const level of ANOTHER_LEVELS) assert.throws(() => createPracticeRun(original, { level }));
});

test("a saved ANOTHER practice choice is restored", () => {
  for (const level of ANOTHER_LEVELS) {
    const storage = { getItem: () => JSON.stringify({ level, rate: 1, volume: 65 }) };
    assert.equal(readPracticeSettings(storage).level, level);
  }
});
