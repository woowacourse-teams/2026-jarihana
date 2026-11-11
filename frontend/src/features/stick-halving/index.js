export { CutResult, formatPercent } from "./CutResult";
export { StickBoard } from "./StickBoard";
export { StickHalvingGame } from "./StickHalvingGame";
export {
  ROUND_COUNT,
  ROUNDS,
  STICK_LENGTH_CM,
  generatePracticeStick,
  judge,
  randomSeed
} from "./puzzle";

// 로그인 없이 브라우저에서만 도는 연습 판이다. 게임방에서도 같은 연결부를 쓸 수 있다.
export { createPracticeAdapter } from "./practiceAdapter";
