import { ROUND_COUNT, generatePracticeStick, judge, randomSeed } from "./puzzle";

// 연습 판은 서버 없이 같은 규칙으로 막대를 만들고 판정한다. 기록은 남기지 않는다.
export function createPracticeAdapter(seed = randomSeed()) {
  let totalScore = 0;
  const sticks = new Map();
  const stickFor = (round) => {
    if (!sticks.has(round)) sticks.set(round, generatePracticeStick(seed, round));
    return sticks.get(round);
  };

  return {
    cut(round, position) {
      const result = judge(stickFor(round), position);
      totalScore += result.score;
      const finished = round >= ROUND_COUNT;
      return {
        ...result,
        finished,
        nextStick: finished ? null : stickFor(round + 1),
        round,
        timedOut: false,
        totalScore
      };
    },
    seed,
    start() {
      totalScore = 0;
      return { round: 1, stick: stickFor(1) };
    }
  };
}
