import { clampPosition } from "../../src/features/stick-halving/StickBoard";
import {
  KNIFE_STEP_CM,
  KNIFE_STEPS_PER_CM,
  ROUND_COUNT,
  STICK_LENGTH_CM,
  answerPosition,
  composition,
  errorRateAt,
  generatePracticeStick,
  leftMilligrams,
  scoreOf,
  totalMilligrams
} from "../../src/features/stick-halving/puzzle";
import { createPracticeAdapter } from "../../src/features/stick-halving/practiceAdapter";

const sum = (mix) => mix.biscuit + mix.thin + mix.thick + mix.almond;

describe("반 나누기 막대", () => {
  it("weighs each half-centimeter cell by chocolate level and adds almonds left of the cut", () => {
    const stick = {
      almonds: [{ cell: 3, size: "LARGE" }],
      cells: new Array(24).fill("THIN"),
      startPosition: 6
    };

    expect(totalMilligrams(stick)).toBe(3700);
    expect(leftMilligrams(stick, 1.75)).toBeCloseTo(525);
    expect(leftMilligrams(stick, 1.76)).toBeCloseTo(628);
  });

  it("scores 1000 for an exact cut and loses points linearly until a 10% error", () => {
    expect(scoreOf(0)).toBe(1000);
    expect(scoreOf(0.025)).toBe(750);
    expect(scoreOf(0.1)).toBe(0);
    expect(scoreOf(0.3)).toBe(0);
  });

  it("generates fair practice sticks whose answer is off center but never on an almond", () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      for (let round = 1; round <= ROUND_COUNT; round += 1) {
        const stick = generatePracticeStick(seed * 7919, round);
        const answer = answerPosition(stick);
        const ratio = answer / STICK_LENGTH_CM;

        expect(stick.cells).toHaveLength(24);
        expect(ratio).toBeGreaterThanOrEqual(0.3);
        expect(ratio).toBeLessThanOrEqual(0.7);
        expect(Math.abs(ratio - 0.5)).toBeGreaterThanOrEqual(0.02);
        expect(errorRateAt(stick, answer)).toBeLessThan(1e-6);
        expect(stick.totalMilligrams).toBe(totalMilligrams(stick));
        if (round <= 3) expect(stick.almonds).toHaveLength(0);
        for (const almond of stick.almonds) expect(stick.cells[almond.cell]).not.toBe("NONE");
      }
    }
  });

  it("puts every answer on the knife grid so a perfect cut is reachable", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      for (let round = 1; round <= ROUND_COUNT; round += 1) {
        const stick = generatePracticeStick(seed * 104729, round);
        const steps = answerPosition(stick) * KNIFE_STEPS_PER_CM;

        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
        expect(scoreOf(errorRateAt(stick, clampPosition(answerPosition(stick))))).toBe(1000);
      }
    }
  });

  it("keeps the knife on the grid inside the stick", () => {
    expect(clampPosition(5.2601)).toBeCloseTo(252 / KNIFE_STEPS_PER_CM, 12);
    expect(clampPosition(0)).toBeCloseTo(5 / KNIFE_STEPS_PER_CM, 12);
    expect(clampPosition(12)).toBeCloseTo(571 / KNIFE_STEPS_PER_CM, 12);
    expect(clampPosition(6 + KNIFE_STEP_CM * 0.4)).toBe(6);
  });

  it("repeats the same stick for the same seed and round", () => {
    expect(generatePracticeStick(20261111, 4)).toEqual(generatePracticeStick(20261111, 4));
  });

  it("splits weight into biscuit, chocolate and almonds that add up to each side", () => {
    const stick = generatePracticeStick(42, 5);
    for (const position of [0.4, 3.3, 6, 8.75, 11.6]) {
      const left = leftMilligrams(stick, position);
      expect(sum(composition(stick, 0, position))).toBeCloseTo(left, 9);
      expect(sum(composition(stick, position, STICK_LENGTH_CM))).toBeCloseTo(stick.totalMilligrams - left, 9);
    }
  });
});

describe("연습 판 연결부", () => {
  it("plays five sticks in order and finishes with the summed score", async () => {
    const adapter = createPracticeAdapter(7);
    let { round, stick } = await adapter.start();
    let result;

    for (let expected = 1; expected <= ROUND_COUNT; expected += 1) {
      expect(round).toBe(expected);
      result = await adapter.cut(round, answerPosition(stick));
      expect(result.score).toBe(1000);
      expect(result.finished).toBe(expected === ROUND_COUNT);
      round += 1;
      stick = result.nextStick;
    }

    expect(result.totalScore).toBe(5000);
    expect(result.nextStick).toBeNull();
  });
});
