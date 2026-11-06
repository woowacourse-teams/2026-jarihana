import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameEngine, LANES, simplifyChart, playbackSections } from "../../../src/features/game/rhythm/engine.mjs";
import { spiralCue } from "../../../src/features/game/rhythm/render.mjs";
const chart = JSON.parse(readFileSync(new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url)));
const original = JSON.parse(readFileSync(new URL("./fixtures/pre-climax-chart.json", import.meta.url)));

test("trill then spiral precedes the two-bar double-tap climax at every difficulty", () => {
  assert.deepEqual(chart.playbackBarOrder.slice(36, 44), [41, 42, 43, 44, 39, 40, 37, 38]);
  assert.deepEqual(playbackSections(chart).filter(s => s.startBar >= 37 && s.startBar <= 44).map(s => [s.startBar, s.bars, s.pattern]),
    [[37, 2, "offbeat"], [39, 2, "roll"], [41, 1, "basic"], [42, 1, "trill"], [43, 2, "doubleTap"]]);
  for (const level of ["easy", "medium", "hard", "hardest"]) {
    const expected = simplifyChart(original, level).map(event => {
      const step = chart.playbackBarOrder.indexOf(Math.floor(event.step / 16) + 1) * 16 + event.step % 16;
      const keys = ["hard", "hardest"].includes(level) && step === 640 ? ["up"]
        : level === "hard" && [671, 704].includes(step) ? ["up"] : event.keys;
      return {step, sample: step * 5625, keys};
    }).sort((a,b) => a.step - b.step);
    // Hardest 13~16마디의 사용자 지정 패턴은 별도 테스트에서 확인한다.
    const unchanged = event => level !== "hardest" || event.step < 192 || event.step >= 256;
    assert.deepEqual(simplifyChart(chart, level).filter(unchanged), expected.filter(unchanged));
  }
});

function permutations(items) {
  return items.length ? items.flatMap(item => permutations(items.filter(other => other !== item)).map(rest => [item, ...rest])) : [[]];
}

test("all random maps retain spiral readability, trill boundaries and the later double taps", () => {
  for (const level of ["hard", "hardest"]) for (const map of permutations(LANES)) {
    const run = new GameEngine(chart, {level});
    run.appendLoop(3, 200, 0, map);
    const notes = run.notes.filter(n => n.loop === 3);
    const spiral = notes.filter(n => n.step >= 608 && n.step < 640);
    const rotations = new Set(spiral.map(n => (LANES.indexOf(n.lane) - LANES.indexOf(n.original) + 4) % 4));
    assert.equal(rotations.size, 1);
    const after = notes.filter(n => n.step === 640);
    assert.equal(after.length, 1);
    assert.notEqual(spiral.at(-1).lane, after[0].lane);
    const first = spiral[0];
    const cue = spiralCue(first.at - 0.5, run);
    assert.equal(cue.firstLane, first.lane);
    const doubles = notes.filter(n => n.step >= 672 && n.step < 704);
    if (level === "hardest") for (let i = 0; i < doubles.length; i += 2) assert.equal(doubles[i].lane, doubles[i + 1].lane);
    if (level === "hard") {
      for (let i = 1; i < notes.length; i++) if (notes[i].step - notes[i-1].step === 1) assert.notEqual(notes[i].lane, notes[i-1].lane);
    }
  }
});
