// 반 나누기 게임의 막대 모델이다. 서버(minigame.domain.StickPuzzle)와 같은 규칙을 쓴다.
// 순위 도전은 서버가 막대를 만들고 판정하며, 이 파일은 화면 계산과 로그인 없는 연습 판에만 쓴다.

export const STICK_LENGTH_CM = 12;
export const STICK_CELLS = 24;
export const CELL_CM = STICK_LENGTH_CM / STICK_CELLS;
export const ROUND_COUNT = 5;
export const ROUND_TIME_LIMIT_SECONDS = 30;
export const MAX_SCORE = 1000;
export const ZERO_SCORE_ERROR_RATE = 0.1;

// 0.5cm 칸 하나의 무게(mg). 초코 칸에는 속의 과자 무게도 들어 있다.
export const CELL_MILLIGRAMS = Object.freeze({ NONE: 100, THIN: 150, THICK: 200 });
export const ALMOND_MILLIGRAMS = Object.freeze({ SMALL: 50, LARGE: 100 });

export const ROUNDS = Object.freeze([
  { name: "기본", hint: "초코가 한 덩어리예요. 무게표로 전체의 절반이 어디서 채워지는지 세어 보세요." },
  { name: "얼룩", hint: "초코 덩어리가 여러 개예요. 두께마다 1cm 무게가 달라요." },
  { name: "두께 섞임", hint: "얇은 초코와 두꺼운 초코가 이어져 있어요." },
  { name: "토핑", hint: "아몬드 무게도 더해야 해요. 크기마다 무게가 달라요." },
  { name: "종합", hint: "두께, 빈 구간, 아몬드가 모두 섞였어요." }
]);

export const almondPosition = (almond) => (almond.cell + 0.5) * CELL_CM;

export function totalMilligrams(stick) {
  const cells = stick.cells.reduce((sum, level) => sum + CELL_MILLIGRAMS[level], 0);
  const almonds = stick.almonds.reduce((sum, almond) => sum + ALMOND_MILLIGRAMS[almond.size], 0);
  return cells + almonds;
}

export function leftMilligrams(stick, position) {
  const fullCells = Math.min(STICK_CELLS, Math.max(0, Math.floor(position / CELL_CM)));
  let weight = 0;
  for (let index = 0; index < fullCells; index += 1) weight += CELL_MILLIGRAMS[stick.cells[index]];
  if (fullCells < STICK_CELLS) {
    const covered = (position - fullCells * CELL_CM) / CELL_CM;
    weight += CELL_MILLIGRAMS[stick.cells[fullCells]] * Math.max(0, covered);
  }
  for (const almond of stick.almonds) {
    if (almondPosition(almond) < position) weight += ALMOND_MILLIGRAMS[almond.size];
  }
  return weight;
}

export function errorRateAt(stick, position) {
  const total = totalMilligrams(stick);
  return Math.abs(2 * leftMilligrams(stick, position) - total) / total;
}

export function answerPosition(stick) {
  let low = 0;
  let high = STICK_LENGTH_CM;
  const half = totalMilligrams(stick) / 2;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (leftMilligrams(stick, middle) < half) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export const scoreOf = (errorRate) =>
  Math.round(MAX_SCORE * Math.max(0, 1 - errorRate / ZERO_SCORE_ERROR_RATE));

export function judge(stick, position) {
  const errorRate = errorRateAt(stick, position);
  return { answerPosition: answerPosition(stick), errorRate, score: scoreOf(errorRate) };
}

// [from, to) 구간의 무게를 과자, 얇은 초코, 두꺼운 초코, 아몬드로 나눈다. 아몬드는 to보다 왼쪽일 때만 넣는다.
export function composition(stick, from, to) {
  const result = { almond: 0, biscuit: 0, thick: 0, thin: 0 };
  for (let index = 0; index < STICK_CELLS; index += 1) {
    const overlap =
      Math.max(0, Math.min(to, (index + 1) * CELL_CM) - Math.max(from, index * CELL_CM)) / CELL_CM;
    if (!overlap) continue;
    result.biscuit += CELL_MILLIGRAMS.NONE * overlap;
    if (stick.cells[index] === "THIN") result.thin += (CELL_MILLIGRAMS.THIN - CELL_MILLIGRAMS.NONE) * overlap;
    if (stick.cells[index] === "THICK") result.thick += (CELL_MILLIGRAMS.THICK - CELL_MILLIGRAMS.NONE) * overlap;
  }
  for (const almond of stick.almonds) {
    const position = almondPosition(almond);
    if (position >= from && position < to) result.almond += ALMOND_MILLIGRAMS[almond.size];
  }
  return result;
}

export const toGrams = (milligrams) => milligrams / 1000;

function mulberry32(seed) {
  let state = seed;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function draft(round, random) {
  const uniform = (min, max) => min + (max - min) * random();
  const between = (min, max) => Math.floor(uniform(min, max + 1));
  const cells = new Array(STICK_CELLS).fill("NONE");
  const order = { NONE: 0, THIN: 1, THICK: 2 };
  const pickLevel = () => (random() < 0.5 ? "THIN" : "THICK");
  const coat = (from, to, level) => {
    for (let cell = from; cell < to; cell += 1) if (order[level] > order[cells[cell]]) cells[cell] = level;
  };
  let coatedArea = STICK_CELLS - between(3, 6);
  const patches = () => {
    const count = between(2, 3);
    for (let index = 0; index < count; index += 1) {
      const width = between(2, 6);
      const start = between(0, coatedArea - width);
      coat(start, start + width, pickLevel());
    }
  };
  const drips = () => {
    const bumps = Array.from({ length: 3 }, () => ({
      center: uniform(0, coatedArea * CELL_CM),
      height: uniform(0.3, 1),
      spread: uniform(0.6, 2.4)
    }));
    for (let cell = 0; cell < coatedArea; cell += 1) {
      const x = (cell + 0.5) * CELL_CM;
      const thickness = bumps.reduce(
        (sum, bump) => sum + bump.height * Math.exp(-((x - bump.center) ** 2) / (2 * bump.spread ** 2)),
        0
      );
      cells[cell] = thickness < 0.15 ? "NONE" : thickness < 0.6 ? "THIN" : "THICK";
    }
  };
  const almonds = [];
  const addAlmonds = (min, max) => {
    const coated = cells.map((level, cell) => (level === "NONE" ? -1 : cell)).filter((cell) => cell >= 0);
    if (!coated.length) return;
    const count = between(min, max);
    const used = new Set();
    for (let index = 0; index < count; index += 1) {
      const cell = coated[between(0, coated.length - 1)];
      const size = random() < 0.5 ? "SMALL" : "LARGE";
      if (!used.has(cell)) {
        used.add(cell);
        almonds.push({ cell, size });
      }
    }
  };
  if (round === 1) {
    coatedArea = between(14, 20);
    coat(0, coatedArea, pickLevel());
  } else if (round === 2) {
    patches();
  } else if (round === 3) {
    drips();
  } else if (round === 4) {
    patches();
    addAlmonds(3, 5);
  } else {
    drips();
    const gaps = between(1, 2);
    for (let index = 0; index < gaps; index += 1) {
      const width = between(1, 2);
      const start = between(0, coatedArea - width);
      for (let cell = start; cell < start + width; cell += 1) cells[cell] = "NONE";
    }
    addAlmonds(2, 4);
  }
  const flip = random() < 0.5;
  const placedCells = flip ? [...cells].reverse() : cells;
  const placedAlmonds = flip
    ? almonds.map((almond) => ({ ...almond, cell: STICK_CELLS - 1 - almond.cell }))
    : almonds;
  const stick = {
    almonds: placedAlmonds,
    cells: placedCells,
    lengthCm: STICK_LENGTH_CM,
    startPosition: uniform(0.35, 0.65) * STICK_LENGTH_CM
  };
  return { ...stick, totalMilligrams: totalMilligrams(stick) };
}

function isFair(stick) {
  const answer = answerPosition(stick);
  const ratio = answer / STICK_LENGTH_CM;
  return (
    ratio >= 0.3 && ratio <= 0.7 && Math.abs(ratio - 0.5) >= 0.02 && errorRateAt(stick, answer) < 1e-6
  );
}

const FALLBACK_STICK = Object.freeze({
  almonds: [],
  cells: [...new Array(6).fill("NONE"), ...new Array(18).fill("THICK")],
  lengthCm: STICK_LENGTH_CM,
  startPosition: STICK_LENGTH_CM / 2,
  totalMilligrams: 4200
});

// 로그인 없는 연습 판의 막대다. 같은 seed와 막대 번호는 언제나 같은 막대를 만든다.
export function generatePracticeStick(seed, round) {
  const random = mulberry32((seed + Math.imul(round, 0x9e3779b1)) >>> 0);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const stick = draft(round, random);
    if (isFair(stick)) return stick;
  }
  return FALLBACK_STICK;
}

export function randomSeed() {
  try {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 4294967296);
  }
}
