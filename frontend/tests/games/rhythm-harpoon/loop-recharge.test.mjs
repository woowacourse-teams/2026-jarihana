import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine, CAPTURE_WINDOW, ATTACK_DURATION } from "../../../src/features/game/rhythm/engine.mjs";

const chart = {
  bpm: 128,
  durationSeconds: 1.875,
  sampleRateHz: 12800,
  samplesPerSixteenth: 1500,
  sections: [],
  events: [0, 12].map((step) => ({ step, sample: step * 1500, keys: ["left"] }))
};

test("each completed loop restores five hearts on Hardest and three on other levels", () => {
  for (const [level, hearts] of [["easy", 3], ["medium", 3], ["hard", 3], ["hardest", 5]]) {
    for (const startLoop of [1, 6]) {
      const run = new GameEngine(chart, { level, startLoop, autoplay: true });
      run.lives = 1;
      run.tick(run.loops[0].end - 0.001);
      assert.equal(run.lives, 1);
      run.tick(run.loops[0].end);
      assert.equal(run.lives, 1 + hearts);
      run.tick(run.loops[0].end + 0.001);
      assert.equal(run.lives, 1 + hearts);
      run.lives = 1;
      run.tick(run.loops[1].end);
      assert.equal(run.lives, 1 + hearts);
    }
  }
});

test("scheduling loops grants no hearts and completion cannot exceed the life cap", () => {
  for (const level of ["easy", "medium", "hard", "hardest"]) {
    const run = new GameEngine(chart, { level, autoplay: true });
    run.lives--;
    run.appendNextLoop();
    assert.equal(run.lives, run.maxLives - 1);
    run.tick(run.loops[0].end);
    assert.equal(run.lives, run.maxLives);
    run.lives--;
    run.tick(run.loops[0].end);
    assert.equal(run.lives, run.maxLives - 1);
  }
});

test("a delayed frame grants completion before damage belonging to the next loop", () => {
  const run = new GameEngine(chart, { level: "hard" });
  for (const note of run.notes.filter((note) => note.loop === 1)) run.input(note.lane, note.at);
  run.lives = 1;
  const end = run.loops[0].end;
  run.tick(end + CAPTURE_WINDOW + ATTACK_DURATION + 0.001);
  assert.equal(run.lives, 3);
  assert.equal(run.stats.miss, 1);
  assert.equal(run.dead, false);
});

test("fatal damage before completion ends the run without recharging or resurrection", () => {
  const run = new GameEngine(chart);
  run.lives = 1;
  run.tick(run.loops[1].end);
  assert.equal(run.dead, true);
  assert.equal(run.lives, 0);
  assert.equal(run.nextLoopToHeal, 0);
  run.tick(run.loops[1].end + 1);
  assert.equal(run.lives, 0);
  assert.deepEqual(run.loopHeals, []);
});

test("each completed loop leaves one record with the next loop number and the hearts actually gained", () => {
  const run = new GameEngine(chart, { level: "easy", autoplay: true });
  run.lives = run.maxLives - 2;
  run.tick(run.loops[0].end - 0.001);
  assert.deepEqual(run.loopHeals, []);
  run.tick(run.loops[0].end);
  assert.deepEqual(run.loopHeals, [
    { at: run.loops[0].end, loop: 2, amount: 2, rate: 1.05, speedUp: true }
  ]);
  run.tick(run.loops[1].end);
  assert.deepEqual(run.loopHeals.at(-1), {
    at: run.loops[1].end,
    loop: 3,
    amount: 0,
    rate: 1.1,
    speedUp: true
  });
  run.tick(run.loops[1].end + 0.001);
  assert.equal(run.loopHeals.length, 2);
});

test("the record marks a speed-up only when the next loop is faster", () => {
  const run = new GameEngine(chart, { level: "hardest", autoplay: true });
  run.tick(run.loops[0].end);
  assert.deepEqual(run.loopHeals.at(-1), {
    at: run.loops[0].end,
    loop: 2,
    amount: 0,
    rate: 1,
    speedUp: false
  });
});

test("one delayed tick crossing multiple surviving loops grants each reward once", () => {
  const run = new GameEngine(chart, { autoplay: true, level: "easy" });
  run.lives = 1;
  const end = run.loops[1].end;
  run.tick(end);
  assert.equal(run.lives, 7);
  run.tick(end);
  assert.equal(run.lives, 7);
});
