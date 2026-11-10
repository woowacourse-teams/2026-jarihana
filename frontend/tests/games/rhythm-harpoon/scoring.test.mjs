import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GameEngine,
  LEVELS,
  LANES,
  POOR_PENALTY,
  rateForLoop
} from "../../../src/features/game/rhythm/engine.mjs";

const chart = JSON.parse(
  readFileSync(
    new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
    "utf8"
  )
);

test("a caught or missed germ cannot exempt repeated inputs from empty-hit penalties", () => {
  const run = new GameEngine(chart);
  const first = run.notes[0];
  run.input(first.lane, first.at);
  assert.equal(run.input(first.lane, first.at + 0.01).kind, "poor");
  assert.equal(run.score, 1000 - POOR_PENALTY);
  assert.equal(run.lives, run.maxLives);
  const missed = new GameEngine(chart);
  const note = missed.notes[0];
  missed.tick(note.at + 0.34);
  assert.equal(note.state, "gone");
  assert.equal(missed.input(note.lane, note.at + 0.35).kind, "poor");
});

test("legitimate four-note chords keep their full award without an empty-hit penalty", () => {
  const run = new GameEngine(chart, { startAt: 86.25 });
  const group = run.groups[0];
  for (const note of group.notes) run.input(note.lane, group.at);
  assert.equal(run.score, 4000);
  assert.equal(run.stats.poor, 0);
  assert.equal(run.lives, run.maxLives);
});

test("four-key repeated input stays at or below 5% of a perfect loop across 1280 cadence and phase cases", () => {
  for (const startLoop of [1, 6, 10, 20, 40]) {
    for (const level of Object.keys(LEVELS)) {
      const rate = rateForLoop(startLoop, level);
      for (const hz of [
        2,
        (128 / 60) * rate,
        4,
        (128 / 60) * 2 * rate,
        6,
        (128 / 60) * 4 * rate,
        10,
        12
      ]) {
        for (let phase = 0; phase < 8; phase++) {
          const run = new GameEngine(chart, { level, startLoop, random: () => 0.5 });
          // Continue the full song even when a strategy would already have lost all lives.
          run.lives = 100000;
          const { start, end } = run.loops[0];
          let scoreAtLifeLimit = null;
          for (let at = start + phase / hz / 8; at < end; at += 1 / hz) {
            run.tick(at);
            if (scoreAtLifeLimit === null && 100000 - run.lives >= run.maxLives)
              scoreAtLifeLimit = run.score;
            for (const lane of LANES) run.input(lane, at);
          }
          run.tick(end);
          // 빈 입력마다 헛공격 감점이 붙으므로 박자에 맞춰 뭉개도 라이프가 다할 때까지 완벽한 플레이 점수의 5%를 넘지 못한다.
          const perfect = run.notes.filter((note) => note.at < end).length * 1000;
          assert(
            (scoreAtLifeLimit ?? run.score) <= perfect * 0.05,
            JSON.stringify({ level, startLoop, hz, phase, scoreAtLifeLimit, perfect })
          );
        }
      }
    }
  }
});
