import { HIT_WINDOW, JUDGMENTS, PERFECT_WINDOW } from "./engine.mjs";

// 첫 화면 온라인 매칭 카드의 상대 판을 사람처럼 치게 한다. 대부분 PERFECT와 HIT로 잡고,
// 가끔 ENOUGH로 어긋나거나 놓쳐서 맞는 모습이 나온다. 매번 같은 장면이 되도록 시드 고정 랜덤을 쓴다.
export const RIVAL_SEED = 1111;
const MISS_RATE = 0.06;
// 라이프가 이만큼 남으면 더 놓치지 않는다. 데모 중에 게임 오버 화면이 나오지 않게 한다.
const KEEP_LIVES = 3;
// 세균이 판정선에 닿기 이만큼 전에 칠지 정한다. 미리 정하면 그때의 라이프로 놓칠지를 고를 수 없다.
const PLAN_AHEAD = 0.5;
const ENOUGH_WINDOW = JUDGMENTS.find((judgment) => judgment.kind === "enough").window * 0.9;

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// 칠 시각을 돌려준다. 놓칠 세균이면 null이다.
export function planRivalHit(note, random, lives) {
  if (lives > KEEP_LIVES && random() < MISS_RATE) return null;
  const roll = random();
  const window = roll < 0.6 ? PERFECT_WINDOW : roll < 0.9 ? HIT_WINDOW : ENOUGH_WINDOW;
  const sign = random() < 0.5 ? -1 : 1;
  return note.at + sign * random() * window;
}

// 엔진의 자동 플레이 대신 이 함수로 상대 판을 진행한다. plans는 판마다 새 Map을 넘긴다.
export function driveRival(engine, time, plans, random) {
  for (const note of engine.notes) {
    if (note.state !== "waiting" || note.whiffed || note.at - time > PLAN_AHEAD) continue;
    if (!plans.has(note)) plans.set(note, planRivalHit(note, random, engine.lives));
    const at = plans.get(note);
    if (at !== null && at <= time) engine.hit(note, at);
  }
  engine.tick(time);
}
