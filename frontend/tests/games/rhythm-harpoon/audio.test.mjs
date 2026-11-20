import test from "node:test";
import assert from "node:assert/strict";
import { MusicTransport } from "../../../src/features/game/rhythm/audio.mjs";

function context() {
  const sources = [];
  return {
    currentTime: 10,
    outputLatency: 0.02,
    destination: {},
    sources,
    createGain() {
      return { gain: { value: 0.65 }, connect() {} };
    },
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        stop() {},
        start(...args) {
          this.startArgs = args;
        }
      };
      sources.push(source);
      return source;
    },
    async resume() {},
    async suspend() {}
  };
}

test("audio loops schedule contiguously with playbackRate controlling pitch and tempo", async () => {
  const ctx = context();
  const audio = new MusicTransport(ctx, { duration: 90 });
  const a = { number: 5, start: 1.875, end: 5.625, offset: 86.25, rate: 1 };
  const b = { number: 6, start: a.end, end: a.end + 90 / 1.05, offset: 0, rate: 1.05 };
  await audio.start([a, b]);
  assert.equal(ctx.sources.length, 2);
  assert.deepEqual(ctx.sources[0].startArgs, [audio.baseTime + 1.875, 86.25, 3.75]);
  assert.deepEqual(ctx.sources[1].startArgs, [audio.baseTime + a.end, 0, 90]);
  assert.equal(ctx.sources[1].playbackRate.value, 1.05);
  audio.schedule([a, b]);
  assert.equal(ctx.sources.length, 2);
});

test("scroll speed never changes the scheduled music or its pitch", async () => {
  const { GameEngine } = await import("../../../src/features/game/rhythm/engine.mjs");
  const { readFileSync } = await import("node:fs");
  const chart = JSON.parse(
    readFileSync(
      new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
      "utf8"
    )
  );
  const schedules = [];
  for (const scrollSpeed of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
    const run = new GameEngine(chart, { scrollSpeed, startLoop: 6 });
    const ctx = context();
    const audio = new MusicTransport(ctx, { duration: 90 });
    await audio.start(run.loops);
    schedules.push(
      ctx.sources.map((source) => ({ at: source.startArgs, rate: source.playbackRate.value }))
    );
  }
  for (const schedule of schedules) assert.deepEqual(schedule, schedules[0]);
});

test("minimum-scroll count-in ends one beat before music", async () => {
  const { GameEngine } = await import("../../../src/features/game/rhythm/engine.mjs");
  const { readFileSync } = await import("node:fs");
  const chart = JSON.parse(
    readFileSync(
      new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
      "utf8"
    )
  );
  const run = new GameEngine(chart, { scrollSpeed: 1 });
  const ctx = context();
  ctx.createGain = () => ({
    gain: {
      value: 0.65,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {}
    },
    connect() {}
  });
  const clicks = [];
  ctx.createOscillator = () => {
    const sound = {
      frequency: { value: 0 },
      connect() {},
      disconnect() {},
      stop() {},
      start(at) {
        clicks.push(at);
      }
    };
    return sound;
  };
  const audio = new MusicTransport(ctx, { duration: 90 });
  await audio.start(run.loops);
  audio.countIn(run);
  assert.equal(clicks.length, 4);
  assert.equal(clicks[0], audio.baseTime + run.countInStart);
  assert.equal(clicks[3] + 60 / chart.bpm, audio.baseTime + run.leadIn);
});

test("input timestamps map to the audible output clock and ignore stale resume timestamps", () => {
  const ctx = context();
  const audio = new MusicTransport(ctx, { duration: 90 });
  const now = performance.now();
  audio.baseTime = 2;
  audio.resumedAt = now - 200;
  ctx.getOutputTimestamp = () => ({ contextTime: 10, performanceTime: now - 30 });
  assert(Math.abs(audio.timeAt(now + 20) - 8.05) < 0.000001);
  audio.resumedAt = now + 1;
  const fallback = audio.timeAt(performance.now());
  assert(Math.abs(fallback - 7.98) < 0.01);
});

test("stopping while audio activation is pending cannot schedule a stale run", async () => {
  const ctx = context();
  let activate;
  ctx.resume = () =>
    new Promise((resolve) => {
      activate = resolve;
    });
  const audio = new MusicTransport(ctx, { duration: 90 });
  const starting = audio.start([{ number: 1, start: 1.875, offset: 0, rate: 1 }]);
  audio.stop();
  activate();
  assert.equal(await starting, false);
  assert.equal(ctx.sources.length, 0);
});
