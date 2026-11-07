import { CAPTURE_WINDOW, ATTACK_DURATION } from "./engine.mjs";

// 따라 하기는 본편 곡 대신 이 모듈이 만든 짧은 트릴 채보와 드럼 비트를 쓴다.
export const LESSON_SAMPLE_RATE = 48000;
export const LESSON_TAIL_BARS = 2;
export const LESSON_BARS = Object.freeze({ listen: 2, attempt: 4 });
export const LESSON_GAIN = 1.5;
export const LESSON_TEMPOS = Object.freeze([
  Object.freeze({ bpm: 72, label: "느리게 72", action: "rhythm_lesson_tempo_slow" }),
  Object.freeze({ bpm: 96, label: "보통 96", action: "rhythm_lesson_tempo_normal" }),
  Object.freeze({ bpm: 128, label: "원곡 128", action: "rhythm_lesson_tempo_original" })
]);
export const LESSON_SPEEDS = Object.freeze([1, 1.5, 2, 2.5]);
export const DEFAULT_LESSON_SETTINGS = Object.freeze({ bpm: 96, scrollSpeed: 1 });
// 두 마디마다 좌우, 상하로 짝을 바꾸며 한 방향씩 번갈아 친다.
export const TRILL_PAIRS = Object.freeze([
  Object.freeze(["left", "right"]),
  Object.freeze(["up", "down"])
]);
// 세균 색 순서(빨강, 파랑, 노랑, 초록)에 맞춘 소리 이름. 초록은 본편 채보에 나오지 않는다.
export const NOTE_SYLLABLES = Object.freeze(["쿵", "착", "치", ""]);

export const LESSON_STEPS = Object.freeze([
  Object.freeze({
    key: "kung",
    syllable: "쿵",
    color: 0,
    title: "쿵 = 빨강, 박마다 와요",
    body: "발로 1, 2, 3, 4를 세듯 박마다 오는 큰 북 소리예요. 빨강 세균은 언제나 이 소리에 맞춰 판정선에 닿아요.",
    hint: "소리를 입으로 따라 하면 쉬워요.",
    notation: "4분음표",
    pattern: Object.freeze([0, 4, 8, 12]),
    mix: Object.freeze({ kick: 1, openHat: 0, closedHat: 0.3, bass: 1 })
  }),
  Object.freeze({
    key: "chak",
    syllable: "착",
    color: 1,
    title: "착 = 파랑, 쿵과 쿵 사이",
    body: '쿵 사이에 끼는 소리예요. 입으로 "쿵 착 쿵 착" 하면서 치면 쉬워요.',
    hint: "쿵은 한쪽, 착은 반대쪽으로 번갈아 와요.",
    notation: "8분음표",
    pattern: Object.freeze([0, 2, 4, 6, 8, 10, 12, 14]),
    mix: Object.freeze({ kick: 1, openHat: 1.2, closedHat: 0.3, bass: 1 })
  }),
  Object.freeze({
    key: "chi",
    syllable: "치",
    color: 2,
    title: "치 = 노랑, 더 잘게",
    body: '다음 쿵 바로 앞에 붙는 짧은 소리예요. "쿵 . . 치 쿵"처럼 다음 쿵을 미리 부른다고 생각하면 돼요.',
    hint: "치 다음엔 바로 쿵이 와요.",
    notation: "점8분 + 16분",
    pattern: Object.freeze([0, 3, 4, 7, 8, 11, 12, 15]),
    mix: Object.freeze({ kick: 1, openHat: 0.5, closedHat: 1.6, bass: 1 })
  })
]);

function lessonStep(stepIndex) {
  const step = LESSON_STEPS[stepIndex];
  if (!step) throw new RangeError("따라 하기 단계는 0부터 " + (LESSON_STEPS.length - 1) + "까지예요.");
  return step;
}

function validBpm(bpm) {
  if (!LESSON_TEMPOS.some((tempo) => tempo.bpm === bpm))
    throw new RangeError("따라 하기 빠르기는 72, 96, 128 BPM 중에서 골라요.");
  return bpm;
}

export function createLessonChart(stepIndex, { bpm = DEFAULT_LESSON_SETTINGS.bpm, bars = LESSON_BARS.attempt } = {}) {
  const step = lessonStep(stepIndex);
  validBpm(bpm);
  if (!Number.isInteger(bars) || bars < 1 || bars > 8) throw new RangeError("따라 하기는 1~8마디예요.");
  const samplesPerSixteenth = (LESSON_SAMPLE_RATE * 60) / bpm / 4;
  const events = [];
  for (let bar = 0; bar < bars; bar++) {
    const pair = TRILL_PAIRS[Math.floor(bar / 2) % TRILL_PAIRS.length];
    for (const column of step.pattern) {
      const position = bar * 16 + column;
      events.push({ step: position, sample: position * samplesPerSixteenth, keys: [pair[events.length % 2]] });
    }
  }
  // 엔진은 루프가 끝나기 전에 다음 루프를 미리 붙인다. 빈 마디를 덧붙여 다음 루프 세균이 보이기 전에 끝낸다.
  const totalBars = bars + LESSON_TAIL_BARS;
  return {
    title: "따라 하기 " + step.syllable,
    bpm,
    bars: totalBars,
    playableBars: bars,
    sampleRateHz: LESSON_SAMPLE_RATE,
    samplesPerSixteenth,
    durationSeconds: totalBars * ((60 / bpm) * 4),
    sections: [],
    events
  };
}

// 마지막 세균의 판정과 돌진이 끝나는 시각(루프 시작 기준 초)
export function lessonEndOffset(chart) {
  const last = chart.events[chart.events.length - 1];
  return last.sample / chart.sampleRateHz + CAPTURE_WINDOW + ATTACK_DURATION + 0.25;
}

export function summarizeLesson(engine) {
  const notes = engine.notes.filter((note) => note.loop === engine.loops[0].number);
  const caught = notes.filter((note) => note.state === "caught").length;
  const missed = notes.length - caught;
  const poor = engine.stats.poor;
  return {
    total: notes.length,
    caught,
    missed,
    poor,
    perfect: engine.stats.perfect,
    passed: missed + poor <= Math.floor(notes.length * 0.3)
  };
}

export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const SETTINGS_KEY = "haengseong-lesson-settings-v1";

// 따라 하기의 빠르기와 배속은 다시 접속해도 유지한다. 목록에 없는 값은 기본값으로 돌린다.
export function readLessonSettings(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "null");
    return {
      bpm: LESSON_TEMPOS.some((tempo) => tempo.bpm === parsed?.bpm) ? parsed.bpm : DEFAULT_LESSON_SETTINGS.bpm,
      scrollSpeed: LESSON_SPEEDS.includes(parsed?.scrollSpeed)
        ? parsed.scrollSpeed
        : DEFAULT_LESSON_SETTINGS.scrollSpeed
    };
  } catch {
    return { ...DEFAULT_LESSON_SETTINGS };
  }
}

export function writeLessonSettings(storage, settings) {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify({ bpm: settings.bpm, scrollSpeed: settings.scrollSpeed }));
    return true;
  } catch {
    return false;
  }
}

const PROGRESS_KEY = "haengseong-lesson-v1";
const emptyProgress = () => ({ done: LESSON_STEPS.map(() => false), skipped: false, completed: false });

export function readLessonProgress(storage) {
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    const done = LESSON_STEPS.map((_, index) => Array.isArray(parsed?.done) && parsed.done[index] === true);
    const skipped = parsed?.skipped === true;
    return { done, skipped, completed: skipped || done.every(Boolean) };
  } catch {
    return emptyProgress();
  }
}

export function writeLessonProgress(storage, progress) {
  try {
    if (!storage) return false;
    storage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ done: LESSON_STEPS.map((_, index) => progress.done[index] === true), skipped: progress.skipped === true })
    );
    return true;
  } catch {
    return false;
  }
}

export function markLessonStep(progress, stepIndex) {
  lessonStep(stepIndex);
  const done = progress.done.map((value, index) => value || index === stepIndex);
  return { done, skipped: progress.skipped, completed: progress.skipped || done.every(Boolean) };
}

export function skipLesson(progress) {
  return { done: progress.done.slice(), skipped: true, completed: true };
}

const BASS_ROOTS = [110, 87.31, 130.81, 98];
const BASS_COLUMNS = new Set([0, 3, 6, 10, 12]);

// 마디 안 16분 위치별 드럼: 킥은 정박, 오픈 하이햇은 반박, 클로즈드 하이햇은 16분 엇박에 친다.
export function lessonDrumHits(stepIndex, { bpm = DEFAULT_LESSON_SETTINGS.bpm, bars = LESSON_BARS.attempt } = {}) {
  const { mix } = lessonStep(stepIndex);
  const sixteenth = 60 / validBpm(bpm) / 4;
  const hits = [];
  for (let position = 0; position < bars * 16; position++) {
    const at = position * sixteenth;
    const column = position % 16;
    const bar = Math.floor(position / 16);
    if (column % 4 === 0 && mix.kick) hits.push({ voice: "kick", at, volume: mix.kick * LESSON_GAIN });
    if (column % 4 === 2 && mix.openHat) hits.push({ voice: "openHat", at, volume: mix.openHat * LESSON_GAIN });
    if (column % 2 === 1 && mix.closedHat)
      hits.push({ voice: "closedHat", at, volume: mix.closedHat * LESSON_GAIN });
    if (mix.bass && BASS_COLUMNS.has(column))
      hits.push({
        voice: "bass",
        at,
        volume: mix.bass * LESSON_GAIN,
        frequency: BASS_ROOTS[bar % BASS_ROOTS.length] * (column === 10 ? 2 : 1)
      });
  }
  return hits;
}
