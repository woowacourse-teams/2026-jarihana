import { GameEngine, LANES, LEVELS } from "./engine.mjs";

// 서버 재계산 규칙과 채보 판본이다. 판정, 라이프, 채보를 바꾸면 서버 채보와 대조 데이터를 다시 만들고 판본을 올린다.
export const RANKED_RULES_VERSION = "rhythm-harpoon-ranked-4";
export const RANKED_CHART_VERSION = "bars-13-16-1";
export const RANKED_BATCH_SECONDS = 2;

export function assertRankedVersions({ rulesVersion, chartVersion }) {
  if (rulesVersion !== RANKED_RULES_VERSION || chartVersion !== RANKED_CHART_VERSION) {
    throw new Error("게임이 새로 바뀌었어요. 새로고침한 뒤 다시 도전해 주세요.");
  }
}

// 서버의 Java 엔진과 같은 32비트 LCG다. 같은 시드면 루프마다 같은 방향 배치가 나온다.
export function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createRankedEngine(chart, { level, scrollSpeed, seed }) {
  if (!Object.hasOwn(LEVELS, level)) throw new RangeError("알 수 없는 난이도예요.");
  return new GameEngine(chart, {
    level,
    scrollSpeed,
    random: createSeededRandom(seed),
    startAt: 0,
    startLoop: 1,
    autoplay: false
  });
}

// 서버는 입력마다 그 시각까지 진행한 뒤 판정하고, 묶음 끝에서 보낸 시각까지 진행한다.
export function applyRankedInput(engine, lane, at) {
  engine.tick(at);
  return engine.input(lane, at);
}

export function applyRankedBatch(engine, batch) {
  for (const [laneIndex, at] of batch.inputs) applyRankedInput(engine, LANES[laneIndex], at);
  engine.tick(batch.playedUntil);
}

// 입력을 순서대로 모아 서버로 보낼 묶음을 만든다. 시각은 앞선 입력보다 앞설 수 없다.
export class RankedInputLog {
  constructor() {
    this.pending = [];
    this.lastAt = -Infinity;
    this.lastUntil = -Infinity;
    this.sequence = 0;
  }

  // 서버는 앞선 묶음의 진행 시각보다 이른 입력을 받지 않는다. 묶음을 보낸 직후 처리한 키 입력도 그 시각 이후로 맞춘다.
  clamp(at) {
    return Math.max(at, this.lastAt, this.lastUntil);
  }

  record(lane, at) {
    const laneIndex = LANES.indexOf(lane);
    if (laneIndex < 0) throw new RangeError("알 수 없는 방향이에요.");
    this.lastAt = at;
    this.pending.push([laneIndex, at]);
  }

  // 진행 시각은 앞선 묶음보다 이를 수 없다. 화면 프레임 시각이 직전 묶음을 보낸 시각보다 조금 이를 수 있어 맞춘다.
  take(playedUntil) {
    const inputs = this.pending;
    this.pending = [];
    this.sequence += 1;
    this.lastUntil = Math.max(playedUntil, this.lastAt, this.lastUntil);
    return { sequence: this.sequence, playedUntil: this.lastUntil, inputs };
  }
}

// 묶음을 순번대로 하나씩 보낸다. 서버는 같은 순번을 다시 받으면 계산하지 않으므로 실패한 묶음은 같은 순번으로 다시 보낸다.
export class RankedBatchSender {
  constructor({ send, onResponse, onFailure, retryDelay = 1000, maxFailures = 8, wait }) {
    this.send = send;
    this.onResponse = onResponse;
    this.onFailure = onFailure;
    this.retryDelay = retryDelay;
    this.maxFailures = maxFailures;
    this.wait = wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.queue = [];
    this.running = null;
    this.stopped = false;
  }

  push(batch) {
    if (this.stopped) return this.running ?? Promise.resolve();
    this.queue.push(batch);
    if (!this.running) this.running = this.drain().finally(() => (this.running = null));
    return this.running;
  }

  stop() {
    this.stopped = true;
    this.queue = [];
  }

  async drain() {
    let failures = 0;
    while (this.queue.length && !this.stopped) {
      const batch = this.queue[0];
      try {
        const state = await this.send(batch);
        failures = 0;
        this.queue.shift();
        if (!this.stopped) this.onResponse(state, batch);
      } catch (error) {
        failures += 1;
        if (failures >= this.maxFailures || error?.status >= 400) {
          this.stop();
          this.onFailure(error);
          return;
        }
        await this.wait(this.retryDelay);
      }
    }
  }
}

export function summarizeRankedEngine(engine) {
  return {
    score: engine.score,
    lives: engine.lives,
    combo: engine.combo,
    bestCombo: engine.bestCombo,
    dead: engine.dead,
    loop: engine.currentLoop(engine.elapsed).number,
    ...engine.stats
  };
}
