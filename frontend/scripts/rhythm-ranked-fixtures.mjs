import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GameEngine, LANES, LEVELS, simplifyChart } from "../src/features/game/rhythm/engine.mjs";
import {
  RANKED_BATCH_SECONDS,
  RANKED_CHART_VERSION,
  RANKED_RULES_VERSION,
  applyRankedBatch,
  createSeededRandom,
  summarizeRankedEngine
} from "../src/features/game/rhythm/ranked-run.mjs";

// 공식 도전의 서버 재계산이 쓰는 채보와 JS/Java 대조 데이터를 만든다.
// 출력 파일은 export-rhythm-ranked-fixtures.mjs가 쓰고, 테스트가 최신 상태인지 확인한다.

export const CHART_PATH = fileURLToPath(
  new URL("../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url)
);
export const SERVER_CHART_PATH = fileURLToPath(
  new URL("../../backend/src/main/resources/rhythm-harpoon/ranked-chart.json", import.meta.url)
);
export const GOLDEN_REPLAYS_PATH = fileURLToPath(
  new URL("../../backend/src/test/resources/rhythm-harpoon/golden-replays.json", import.meta.url)
);

export function readChart() {
  return JSON.parse(readFileSync(CHART_PATH, "utf8"));
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest])
  );
}

// 계단 구간의 회전은 루프의 방향 배치에 따라 정해진다. 가능한 24개 배치를 모두 미리 계산해 서버에 둔다.
function staircaseTable(chart, level) {
  const table = {};
  for (const map of permutations(LANES)) {
    const engine = new GameEngine(chart, { level, random: () => 0.5 });
    const loop = engine.appendLoop(99, 0, 0, map);
    if (!loop.stairRotations.length) continue;
    table[map.join(",")] = loop.stairRotations.map(({ start, end, shift }) => [start, end, shift]);
  }
  return table;
}

export function buildRankedChart(chart) {
  const levels = {};
  for (const level of Object.keys(LEVELS)) {
    levels[level] = {
      lives: LEVELS[level].lives,
      events: simplifyChart(chart, level).map(({ step, sample, keys }) => [step, sample, keys]),
      staircases: staircaseTable(chart, level)
    };
  }
  return {
    rulesVersion: RANKED_RULES_VERSION,
    chartVersion: RANKED_CHART_VERSION,
    bpm: chart.bpm,
    sampleRateHz: chart.sampleRateHz,
    durationSeconds: chart.durationSeconds,
    levels
  };
}

function gaussian(random, deviation) {
  const u = random() || 1e-9;
  const v = random();
  return deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 서버가 받는 순서 그대로 묶음을 만들고 같은 엔진으로 진행해 기대값을 얻는다.
function replay(chart, scenario, pressesFor) {
  const engine = new GameEngine(chart, {
    level: scenario.level,
    scrollSpeed: scenario.scrollSpeed,
    startLoop: scenario.startLoop,
    random: createSeededRandom(scenario.seed)
  });
  const noise = createSeededRandom(scenario.seed ^ 0x5bd1e995);
  const batches = [];
  let queued = [];
  let lastAt = -Infinity;
  for (let until = RANKED_BATCH_SECONDS; until <= scenario.seconds && !engine.dead; until += RANKED_BATCH_SECONDS) {
    const from = until - RANKED_BATCH_SECONDS;
    queued = queued.concat(pressesFor(engine, from, until, noise)).sort((a, b) => a[1] - b[1]);
    const due = queued.filter(([, at]) => at < until);
    queued = queued.filter(([, at]) => at >= until);
    const presses = due.map(([laneIndex, at]) => {
      lastAt = Math.max(at, lastAt);
      return [laneIndex, lastAt];
    });
    const batch = { playedUntil: until, inputs: presses };
    applyRankedBatch(engine, batch);
    batches.push(batch);
  }
  return { ...scenario, batches, expected: summarizeRankedEngine(engine) };
}

// 노트마다 한 번만 누를 시각을 정한다. 다음 묶음에 걸친 입력은 그 묶음에서 보낸다.
const human = (deviation, skipRate, strayRate) => (engine, from, until, noise) => {
  const presses = [];
  for (const note of engine.notes) {
    if (note.at < from || note.at >= until) continue;
    if (noise() < skipRate) continue;
    presses.push([LANES.indexOf(note.lane), note.at + gaussian(noise, deviation)]);
  }
  for (let at = from; at < until; at += 0.5) {
    if (noise() < strayRate) presses.push([Math.floor(noise() * 4), at + noise() * 0.5]);
  }
  return presses;
};

const masher = (hz) => (engine, from, until) => {
  const presses = [];
  for (let at = Math.ceil(from * hz) / hz; at < until; at += 1 / hz) {
    for (let laneIndex = 0; laneIndex < LANES.length; laneIndex++) presses.push([laneIndex, at]);
  }
  return presses;
};

export function buildGoldenReplays(chart) {
  const scenarios = [];
  for (const level of Object.keys(LEVELS)) {
    // Hard와 Hardest는 두 번째 루프의 계단(31~32마디)까지 가야 섞인 방향 배치의 회전을 대조할 수 있다.
    const seconds = level === "hard" || level === "hardest" ? 160 : 100;
    scenarios.push(
      replay(
        chart,
        { name: level + "-steady-player", level, seed: 20261107, scrollSpeed: 1.5, startLoop: 1, seconds },
        human(0.02, 0.004, 0.08)
      ),
      replay(
        chart,
        { name: level + "-four-key-masher", level, seed: 7, scrollSpeed: 1, startLoop: 1, seconds: 40 },
        masher(7)
      )
    );
  }
  for (const [level, startLoop] of [
    ["hard", 6],
    ["hardest", 12]
  ]) {
    scenarios.push(
      replay(
        chart,
        { name: level + "-accelerated-loop-" + startLoop, level, seed: 4242, scrollSpeed: 2, startLoop, seconds: 30 },
        human(0.02, 0.05, 0.05)
      )
    );
  }
  scenarios.push(
    replay(
      chart,
      { name: "medium-struggling-player", level: "medium", seed: 99, scrollSpeed: 1, startLoop: 1, seconds: 90 },
      human(0.06, 0.45, 0.2)
    )
  );
  return { rulesVersion: RANKED_RULES_VERSION, chartVersion: RANKED_CHART_VERSION, scenarios };
}

export function serialize(value) {
  return JSON.stringify(value) + "\n";
}
