import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RivalReplay } from "../../../src/features/game/rhythm/battle/mount-battle-game.mjs";
import { createRankedEngine, summarizeRankedEngine } from "../../../src/features/game/rhythm/ranked-run.mjs";
import { GOLDEN_REPLAYS_PATH, readChart } from "../../../scripts/rhythm-ranked-fixtures.mjs";

const chart = readChart();
const golden = JSON.parse(readFileSync(GOLDEN_REPLAYS_PATH, "utf8"));
// 서버와 같은 결과를 내는 골든 리플레이 중 1루프부터 시작하는 기본 곡 시나리오로 상대 판 재현을 대조한다.
const scenarios = golden.scenarios.filter(
  (scenario) => scenario.startLoop === 1 && !scenario.level.startsWith("another")
);

function numbered(batches) {
  return batches.map((batch, index) => ({ ...batch, sequence: index + 1 }));
}

test("the rival board replays delivered batches to the same result the server judges", () => {
  assert.ok(scenarios.length >= 4);
  for (const scenario of scenarios) {
    const engine = createRankedEngine(chart, scenario);
    const replay = new RivalReplay(engine);
    const batches = numbered(scenario.batches);
    // 실시간 연결은 묶음을 몇 개씩 모아 보내고, 다시 연결하면 이미 받은 묶음을 또 보낸다.
    for (let start = 0; start < batches.length; start += 3) {
      const delivered = batches.slice(Math.max(0, start - 2), start + 3).reverse();
      replay.receive(delivered);
      const until = batches[Math.min(batches.length, start + 3) - 1].playedUntil;
      for (let time = until - 1.5; time <= until; time += 0.25) replay.advance(time);
    }
    replay.advance(Number.POSITIVE_INFINITY);
    assert.deepEqual(summarizeRankedEngine(engine), scenario.expected, scenario.name);
  }
});

test("the rival board never runs ahead of the inputs it has received", () => {
  const scenario = scenarios.find((item) => item.name === "medium-struggling-player");
  const engine = createRankedEngine(chart, scenario);
  const replay = new RivalReplay(engine);
  const batches = numbered(scenario.batches);
  replay.receive(batches.slice(0, 2));
  const knownUntil = batches[1].playedUntil;
  assert.equal(replay.advance(knownUntil + 30), knownUntil);
  assert.equal(engine.elapsed, knownUntil);
  // 아직 오지 않은 입력의 노트를 놓친 것으로 그리지 않으므로, 늦게 온 묶음도 원래 결과와 같아진다.
  replay.receive(batches.slice(2));
  replay.advance(Number.POSITIVE_INFINITY);
  assert.deepEqual(summarizeRankedEngine(engine), scenario.expected);
});
