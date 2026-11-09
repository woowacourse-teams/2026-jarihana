import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameEngine, simplifyChart } from "../../../src/features/game/rhythm/engine.mjs";

const chart = JSON.parse(readFileSync(new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url)));
// 첨부 비트 그리드의 1부터 시작하는 열을 방향별로 전사한다.
const reference = {
  13: { left: [1, 3, 5, 7, 9, 11, 13, 15], right: [3, 7, 11, 15] },
  14: { left: [1, 3, 5, 7, 9, 11, 13, 15], down: [3, 15], up: [7, 11] },
  15: { right: [1, 9], left: [3, 15], down: [5, 13], up: [7, 11] },
  16: { right: [1, 14, 16], left: [4], down: [5, 9], up: [8, 13, 15] }
};

test("Hardest bars 13-16 match every occupied cell of the two reference images", () => {
  const run = new GameEngine(chart, { level: "hardest" });
  const first = run.notes.filter(note => note.loop === 1);
  for (const [barNumber, lanes] of Object.entries(reference)) {
    const bar = Number(barNumber);
    const notes = first.filter(note => Math.floor(note.step / 16) + 1 === bar);
    const actual = notes.map(note => `${note.lane}:${note.step % 16 + 1}`).sort();
    const expected = Object.entries(lanes).flatMap(([lane, columns]) => columns.map(column => `${lane}:${column}`)).sort();
    assert.deepEqual(actual, expected, `bar ${bar}`);
    for (const note of notes) assert.equal(note.at - run.loops[0].start, note.step * chart.samplesPerSixteenth / chart.sampleRateHz);
  }
  assert.equal(first.filter(n => n.step >= 192 && n.step < 224).length, 24);
  assert.equal(first.filter(n => n.step >= 224 && n.step < 256).length, 17);
});

test("edited bars preserve other difficulties, other Hardest bars and musical timing", () => {
  const previous = { ...chart, playbackOverrides: undefined };
  for (const level of ["easy", "medium", "hard"]) {
    assert.deepEqual(simplifyChart(chart, level), simplifyChart(previous, level));
  }
  const outside = events => events.filter(e => e.step < 192 || e.step >= 256);
  assert.deepEqual(outside(simplifyChart(chart, "hardest")), outside(simplifyChart(previous, "hardest")));
  assert.equal(chart.bpm, 128);
  assert.equal(chart.durationSeconds, 90);
});
