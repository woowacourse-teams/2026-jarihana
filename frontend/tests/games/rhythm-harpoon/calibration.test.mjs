import test from "node:test";
import assert from "node:assert/strict";
import {
  CalibrationRun,
  SYNC_CONFIG,
  readOffset,
  writeOffset
} from "../../../src/features/game/rhythm/calibration.mjs";
import { CalibrationMetronome } from "../../../src/features/game/rhythm/audio.mjs";

function measured(deltas) {
  const run = new CalibrationRun();
  deltas.forEach((delta, index) => {
    if (delta !== null) run.tap((SYNC_CONFIG.warmup + index) * run.interval + delta / 1000);
  });
  return run;
}

test("positive and negative offsets retain their sign, exclude warmup and use robust samples", () => {
  for (const offset of [73, -44, 0, 150, -150]) {
    const run = measured(Array(20).fill(offset));
    assert.equal(run.tap(0), false);
    const result = run.result();
    assert.equal(result.reliable, true);
    assert.equal(result.offset, offset);
    assert.equal(result.used, 20);
    assert.equal(result.spread, 0);
  }
  const run = measured([...Array(16).fill(72), -250, 240, -230, 270]);
  assert.equal(run.result().offset, 72);
  assert.equal(run.result().excluded, 4);
  assert.equal(run.result().used, 16);
  assert.equal(run.result().reliable, true);
  for (const offset of [220, -220, 300, -300]) {
    const result = measured(Array(20).fill(offset)).result();
    assert.equal(result.reliable, false);
    assert.equal(result.reason, "range");
    assert.equal(result.offset, offset);
  }
});

test("missed beats, unstable tempo and repeated mashing cannot yield a confident recommendation", () => {
  assert.equal(measured(Array(8).fill(42)).result().reason, "few");
  assert.equal(
    measured(Array.from({ length: 20 }, (_, i) => (i % 2 ? 140 : -140))).result().reliable,
    false
  );
  assert.equal(
    measured(Array.from({ length: 20 }, (_, i) => -20 + i * 7)).result().reliable,
    false
  );
  const run = measured(Array(20).fill(42));
  const first = SYNC_CONFIG.warmup * run.interval;
  for (let index = 0; index < 10; index++) run.tap(first + 0.05 + index * 0.005);
  assert.equal(run.samples.size, 20);
  assert.equal(run.samples.get(0) > 41.99, true);
  assert.equal(run.result().reliable, false);
  assert.equal(run.tap(run.endAt + 1), false);
});

test("offset storage validates values and gracefully handles blocked browser storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.equal(readOffset(storage), 0);
  for (const value of [-150, -42, 0, 73, 150]) {
    assert.equal(writeOffset(storage, value), true);
    assert.equal(readOffset(storage), value);
  }
  for (const value of [301, Infinity, NaN, 1.2]) assert.equal(writeOffset(storage, value), false);
  for (const value of ["", "null", "NaN", "1000", "1.5"])
    assert.equal(readOffset({ getItem: () => value }), 0);
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    }
  };
  assert.equal(readOffset(blocked), 0);
  assert.equal(writeOffset(blocked, 42), false);
});

function context() {
  const ctx = {
    currentTime: 10,
    state: "running",
    destination: {},
    sources: [],
    closed: 0,
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {}
        },
        connect() {},
        disconnect() {}
      };
    },
    createOscillator() {
      const source = {
        frequency: { value: 0 },
        connect() {},
        disconnect() {},
        start(at) {
          this.at = at;
        },
        stop() {
          this.stopped = true;
        }
      };
      this.sources.push(source);
      return source;
    },
    async resume() {},
    async close() {
      this.closed++;
      this.state = "closed";
    }
  };
  return ctx;
}

test("metronome schedules all beats on the audio clock and disposes every click on cancellation", async () => {
  const ctx = context();
  const audio = new CalibrationMetronome(ctx);
  await audio.start(SYNC_CONFIG, 50);
  assert.equal(ctx.sources.length, 24);
  assert.equal(ctx.sources[4].frequency.value, 1320);
  for (const [index, source] of ctx.sources.entries())
    assert(Math.abs(source.at - (10.25 + (index * 60) / 90)) < 1e-8);
  audio.stop();
  audio.stop();
  assert.equal(ctx.closed, 1);
  assert(ctx.sources.every((source) => source.stopped));
});

test("cancelling during audio resume cannot start stale clicks", async () => {
  const ctx = context();
  let release;
  ctx.resume = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const audio = new CalibrationMetronome(ctx);
  const pending = audio.start(SYNC_CONFIG, 50);
  audio.stop();
  release();
  assert.equal(await pending, false);
  assert.equal(ctx.sources.length, 0);
});

test("audio output timestamps prevent counting hardware output latency a second time", async () => {
  const ctx = context();
  ctx.outputLatency = 0.15;
  const audio = new CalibrationMetronome(ctx);
  await audio.start(SYNC_CONFIG, 50);
  const timestamp = { contextTime: 11, performanceTime: audio.resumedAt + 1 };
  ctx.getOutputTimestamp = () => timestamp;
  const run = new CalibrationRun();
  for (let index = 0; index < 20; index++) {
    const beat = (SYNC_CONFIG.warmup + index) * run.interval;
    const stamp =
      timestamp.performanceTime + (audio.baseTime + beat + 0.073 - timestamp.contextTime) * 1000;
    run.tap(audio.timeAt(stamp));
  }
  assert.equal(run.result().offset, 73);
  assert.equal(run.result().reliable, true);
  audio.stop();
});
