import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANES } from "../../../src/features/game/rhythm/engine.mjs";
import {
  RankedBatchSender,
  RankedInputLog,
  applyRankedBatch,
  assertRankedVersions,
  RANKED_RULES_VERSION,
  RANKED_CHART_VERSION,
  createRankedEngine,
  createSeededRandom,
  summarizeRankedEngine
} from "../../../src/features/game/rhythm/ranked-run.mjs";
import {
  GOLDEN_REPLAYS_PATH,
  SERVER_CHART_PATH,
  buildGoldenReplays,
  buildRankedChart,
  readChart,
  serialize
} from "../../../scripts/rhythm-ranked-fixtures.mjs";

const chart = readChart();
// Windows 체크아웃은 줄바꿈을 CRLF로 바꿀 수 있어 LF로 맞춰 비교한다.
const readText = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("ranked play rejects stale rules even when the chart version still matches", () => {
  const current = { rulesVersion: RANKED_RULES_VERSION, chartVersion: RANKED_CHART_VERSION };
  assert.doesNotThrow(() => assertRankedVersions(current));
  for (const session of [
    { ...current, rulesVersion: "rhythm-harpoon-ranked-1" },
    { ...current, rulesVersion: undefined },
    { ...current, chartVersion: "old-chart" }
  ]) {
    assert.throws(() => assertRankedVersions(session), /새로고침/);
  }
});

test("the seeded random matches the 32-bit LCG the server reimplements", () => {
  const random = createSeededRandom(1);
  assert.deepEqual(
    [random(), random(), random()].map((value) => Math.round(value * 4294967296)),
    [1015568748, 1586005467, 2165703038]
  );
  const a = createSeededRandom(123456789);
  const b = createSeededRandom(123456789);
  for (let index = 0; index < 50; index++) assert.equal(a(), b());
});

test("the same seed lays out every loop the same way", () => {
  const first = createRankedEngine(chart, { level: "hardest", scrollSpeed: 1, seed: 99 });
  const second = createRankedEngine(chart, { level: "hardest", scrollSpeed: 1, seed: 99 });
  for (let index = 0; index < 4; index++) {
    first.appendNextLoop();
    second.appendNextLoop();
  }
  assert.deepEqual(
    first.loops.map((loop) => loop.map),
    second.loops.map((loop) => loop.map)
  );
  assert.deepEqual(first.loops[0].map, LANES);
});

test("the input log keeps inputs in order and never sends one past its batch end", () => {
  const log = new RankedInputLog();
  log.record("left", 1.2);
  assert.equal(log.clamp(1.1), 1.2);
  log.record("up", log.clamp(1.1));
  const batch = log.take(1.15);
  assert.deepEqual(batch, { sequence: 1, playedUntil: 1.2, inputs: [[0, 1.2], [3, 1.2]] });
  assert.deepEqual(log.take(3).inputs, []);
  assert.equal(log.take(5).sequence, 3);
  assert.equal(log.take(4.99).playedUntil, 5, "a later batch never reports an earlier time");
});

test("the batch sender sends one batch at a time in order and retries a failed one with the same sequence", async () => {
  const sent = [];
  let failOnce = true;
  const responses = [];
  const sender = new RankedBatchSender({
    send: async (batch) => {
      sent.push(batch.sequence);
      if (batch.sequence === 2 && failOnce) {
        failOnce = false;
        throw new TypeError("network");
      }
      return { status: "PLAYING", sequence: batch.sequence };
    },
    onResponse: (state) => responses.push(state.sequence),
    onFailure: () => assert.fail("a network blip must be retried"),
    wait: async () => {}
  });
  sender.push({ sequence: 1 });
  sender.push({ sequence: 2 });
  await sender.push({ sequence: 3 });
  assert.deepEqual(sent, [1, 2, 2, 3]);
  assert.deepEqual(responses, [1, 2, 3]);
});

test("the batch sender stops on a rejected request or after repeated failures", async () => {
  const failures = [];
  const rejected = new RankedBatchSender({
    send: async () => {
      throw Object.assign(new Error("conflict"), { status: 409 });
    },
    onResponse: () => assert.fail("no response"),
    onFailure: (error) => failures.push(error.status),
    wait: async () => {}
  });
  await rejected.push({ sequence: 1 });
  assert.deepEqual(failures, [409]);
  let attempts = 0;
  const offline = new RankedBatchSender({
    send: async () => {
      attempts += 1;
      throw new TypeError("offline");
    },
    onResponse: () => assert.fail("no response"),
    onFailure: () => failures.push("offline"),
    maxFailures: 3,
    wait: async () => {}
  });
  await offline.push({ sequence: 1 });
  assert.equal(attempts, 3);
  assert.deepEqual(failures, [409, "offline"]);
});

test("a ranked batch judges each input after advancing to its time", () => {
  const engine = createRankedEngine(chart, { level: "easy", scrollSpeed: 1, seed: 5 });
  const note = engine.notes[0];
  applyRankedBatch(engine, { playedUntil: note.at + 1, inputs: [[LANES.indexOf(note.lane), note.at]] });
  const summary = summarizeRankedEngine(engine);
  assert.equal(summary.perfect, 1);
  assert.equal(summary.score, 1000);
});

test("the server chart and the JS/Java golden replays are regenerated from the current engine", () => {
  assert.equal(
    readText(SERVER_CHART_PATH),
    serialize(buildRankedChart(chart)),
    "node scripts/export-rhythm-ranked-fixtures.mjs로 서버 채보를 다시 만들어요."
  );
  assert.equal(
    readText(GOLDEN_REPLAYS_PATH),
    serialize(buildGoldenReplays(chart)),
    "node scripts/export-rhythm-ranked-fixtures.mjs로 대조 데이터를 다시 만들어요."
  );
});

test("golden replays exercise two loop rewards on every level with real missed groups", () => {
  const golden = JSON.parse(readText(GOLDEN_REPLAYS_PATH));
  for (const [level, lives] of [["easy", 6], ["medium", 4], ["hard", 4], ["hardest", 8]]) {
    const scenario = golden.scenarios.find((item) => item.name === level + "-loop-recharge");
    assert.equal(scenario.expected.lives, lives);
    assert.equal(scenario.expected.loop, 3);
    assert.equal(scenario.expected.dead, false);
    assert(scenario.expected.miss > 0);
  }
});
