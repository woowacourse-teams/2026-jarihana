import { GameEngine, PRACTICE_LEVELS } from "./engine.mjs";

// These runs are local feedback only. A future record API must independently
// validate a server-issued session and inputs, never accept this local summary.
export function createPracticeRun(chart, settings = {}) {
  const allowed = new Set(["level", "scrollSpeed"]);
  if (Object.keys(settings).some((key) => !allowed.has(key))) {
    throw new TypeError("서비스 연습에서는 난이도와 이동 배속만 설정할 수 있어요.");
  }
  const level = settings.level ?? "easy";
  if (!Object.hasOwn(PRACTICE_LEVELS, level)) throw new RangeError("알 수 없는 난이도예요.");
  const engine = new GameEngine(chart, {
    level,
    // ANOTHER는 스윙 곡 전용 채보를 단순화 없이 그대로 친다.
    ...(level === "another" ? { events: chart.events } : {}),
    scrollSpeed: settings.scrollSpeed ?? 1,
    startAt: 0,
    startLoop: 1,
    autoplay: false
  });
  return Object.freeze({ mode: "practice", verification: "unverified", engine });
}

export function summarizePracticeRun(run) {
  if (run.mode !== "practice" || run.verification !== "unverified") {
    throw new TypeError("연습 플레이 결과만 표시할 수 있어요.");
  }
  return Object.freeze({
    mode: "practice",
    verification: "unverified",
    level: run.engine.level,
    score: run.engine.score,
    bestCombo: run.engine.bestCombo
  });
}
