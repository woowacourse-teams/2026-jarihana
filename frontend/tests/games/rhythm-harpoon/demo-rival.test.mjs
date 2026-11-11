import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { RIVAL_SEED, driveRival, planRivalHit, seededRandom } from "../../../src/features/game/rhythm/demo-rival.mjs";
import { GameEngine } from "../../../src/features/game/rhythm/engine.mjs";
import { Renderer } from "../../../src/features/game/rhythm/render.mjs";

// 첫 화면 카드가 실제로 돌리는 원곡 채보다.
const chart = JSON.parse(
  readFileSync(new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url), "utf8")
);

function playRival(seconds) {
  const engine = new GameEngine(chart, { level: "medium", scrollSpeed: 1 });
  const plans = new Map();
  const random = seededRandom(RIVAL_SEED);
  const start = engine.loops[0].start;
  for (let time = start; time <= start + seconds; time += 1 / 60) driveRival(engine, time, plans, random);
  return engine;
}

test("the demo rival mostly lands PERFECT and HIT, sometimes misses, and never loses the whole run", () => {
  const engine = playRival(30);
  assert.equal(engine.dead, false);
  assert(engine.lives >= 3, "lives " + engine.lives);
  assert(engine.stats.perfect > engine.stats.hit, JSON.stringify(engine.stats));
  assert(engine.stats.hit > 0 && engine.stats.miss > 0, JSON.stringify(engine.stats));
  // 판정 범위 안에서만 치므로 세균을 빗맞히거나(Uh oh) 헛공격을 하지 않는다.
  assert.equal(engine.stats.uhoh, 0);
  assert.equal(engine.stats.poor, 0);
});

test("the demo rival replays the same scene every cycle", () => {
  assert.deepEqual(playRival(30).stats, playRival(30).stats);
});

test("the demo rival stops missing once only a few lives are left", () => {
  const always = () => 0;
  assert.equal(planRivalHit({ at: 10 }, always, 8), null);
  const hit = planRivalHit({ at: 10 }, always, 3);
  assert.equal(typeof hit, "number");
  assert(Math.abs(hit - 10) <= 0.032);
});

test("a board can rest on a different face, and still flinches when hit", () => {
  const faces = [];
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    canvas: { width: 900, height: 900 },
    ctx: { setTransform() {}, clearRect() {} },
    effects: [],
    hurtUntil: -1,
    lastHit: null,
    restingExpression: 1,
    field() {},
    germ() {},
    harpoon() {},
    chordLinks() {},
    turnSignal() {},
    loopBanner() {},
    text() {},
    sprite(index, x, y, width) {
      if (width === 132) faces.push(index);
    }
  });
  const engine = { notes: [], loops: [{ start: 0 }], countInStart: 0, chart: { bpm: 128 } };
  renderer.draw(1, engine);
  renderer.hurtUntil = 3;
  renderer.draw(2, engine);
  assert.deepEqual(faces, [1, 3]);
});
