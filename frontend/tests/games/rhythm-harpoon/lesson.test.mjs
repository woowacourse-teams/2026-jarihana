import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine, noteColor } from "../../../src/features/game/rhythm/engine.mjs";
import { Renderer } from "../../../src/features/game/rhythm/render.mjs";
import {
  CORE_LESSON_STEPS,
  LESSON_BARS,
  LESSON_GAIN,
  LESSON_STEPS,
  LESSON_TAIL_BARS,
  NOTE_SYLLABLES,
  createLessonChart,
  lessonBpm,
  lessonDrumHits,
  lessonEndOffset,
  lessonTempos,
  markLessonStep,
  readLessonProgress,
  scoreStepAt,
  skipLesson,
  summarizeLesson,
  writeLessonProgress
} from "../../../src/features/game/rhythm/lesson.mjs";
import { countLabel, layoutRhythmBar } from "../../../src/features/game/rhythm/notation.mjs";

const lessonEngine = (stepIndex, options = {}) => {
  const chart = createLessonChart(stepIndex, { bpm: options.bpm ?? 96, bars: options.bars ?? 4 });
  return {
    chart,
    engine: new GameEngine(chart, { level: "easy", events: chart.events, ...options.engine })
  };
};

test("lesson charts alternate two directions per pair of bars and follow the chosen tempo", () => {
  const chart = createLessonChart(0, { bpm: 96, bars: 4 });
  assert.deepEqual(
    chart.events.map((event) => event.step),
    [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]
  );
  assert.deepEqual(
    chart.events.map((event) => event.keys[0]),
    [
      ...Array(4).fill(["left", "right"]).flat(),
      ...Array(4).fill(["up", "down"]).flat()
    ]
  );
  assert.equal(chart.events[1].sample / chart.sampleRateHz, 60 / 96);
  assert.equal(chart.durationSeconds, (4 + LESSON_TAIL_BARS) * ((60 / 96) * 4));
  const slow = createLessonChart(1, { bpm: 72, bars: 2 });
  assert.equal(slow.events.length, 16);
  assert.equal(slow.events[1].sample / slow.sampleRateHz, 60 / 72 / 2);
  assert.throws(() => createLessonChart(4), RangeError);
  // 스윙 단계(따)는 원곡 128 대신 스윙 144를 쓴다.
  assert.throws(() => createLessonChart(3, { bpm: 128 }), RangeError);
  assert.throws(() => createLessonChart(0, { bpm: 144 }), RangeError);
  assert.throws(() => createLessonChart(0, { bpm: 90 }), RangeError);
  assert.throws(() => createLessonChart(0, { bars: 0 }), RangeError);
});

test("the engine keeps prepared lesson events instead of thinning them for a difficulty", () => {
  const { chart, engine } = lessonEngine(1);
  const firstLoop = engine.notes.filter((note) => note.loop === 1);
  assert.equal(firstLoop.length, chart.events.length);
  assert.deepEqual(
    firstLoop.slice(0, 4).map((note) => [note.color, note.lane]),
    [
      [0, "left"],
      [1, "right"],
      [0, "left"],
      [1, "right"]
    ]
  );
  // 빈 마디 덕분에 다음 루프 세균은 마지막 판정이 끝난 뒤에야 나타난다.
  const nextLoop = engine.notes.find((note) => note.loop === 2);
  assert(nextLoop.spawnAt > engine.loops[0].start + lessonEndOffset(chart));
  assert.equal(chart.events.length, 32);
  assert.equal(new GameEngine(chart, { level: "easy" }).notes.filter((note) => note.loop === 1).length < 32, true);
});

test("lesson summaries pass a clean run and fail an untouched one", () => {
  const auto = lessonEngine(2, { engine: { autoplay: true } });
  const end = auto.engine.loops[0].start + lessonEndOffset(auto.chart);
  for (let time = 0; time <= end; time += 0.05) auto.engine.tick(time);
  assert.deepEqual(
    { ...summarizeLesson(auto.engine), perfect: undefined },
    { total: 32, caught: 32, missed: 0, poor: 0, perfect: undefined, passed: true }
  );
  const idle = lessonEngine(0);
  const idleEnd = idle.engine.loops[0].start + lessonEndOffset(idle.chart);
  for (let time = 0; time <= idleEnd; time += 0.05) idle.engine.tick(time);
  const summary = summarizeLesson(idle.engine);
  assert.equal(summary.caught, 0);
  assert.equal(summary.passed, false);
});

test("lesson progress survives reloads, tolerates broken storage and records skips", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let progress = readLessonProgress(storage);
  assert.deepEqual(progress, { done: [false, false, false, false], skipped: false, completed: false });
  progress = markLessonStep(markLessonStep(progress, 0), 2);
  assert.equal(writeLessonProgress(storage, progress), true);
  assert.deepEqual(readLessonProgress(storage), { done: [true, false, true, false], skipped: false, completed: false });
  // 번외 단계(따)만 끝내도 완료가 아니고, 기본 세 단계를 끝내면 번외 단계 없이도 완료다.
  assert.equal(markLessonStep(progress, 3).completed, false);
  progress = markLessonStep(progress, 1);
  writeLessonProgress(storage, progress);
  assert.equal(readLessonProgress(storage).completed, true);
  values.clear();
  writeLessonProgress(storage, skipLesson(readLessonProgress(storage)));
  assert.deepEqual(readLessonProgress(storage), { done: [false, false, false, false], skipped: true, completed: true });
  // 번외 단계가 생기기 전에 세 단계를 끝내 저장한 기록도 그대로 완료다.
  values.set("haengseong-lesson-v1", JSON.stringify({ done: [true, true, true], skipped: false }));
  assert.deepEqual(readLessonProgress(storage), { done: [true, true, true, false], skipped: false, completed: true });
  assert.equal(readLessonProgress({ getItem: () => "{broken" }).completed, false);
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    }
  };
  assert.equal(readLessonProgress(blocked).completed, false);
  assert.equal(writeLessonProgress(blocked, progress), false);
  assert.equal(writeLessonProgress(null, progress), false);
  assert.throws(() => markLessonStep(progress, 5), RangeError);
});

test("the lesson drum beat places each voice on its beat position and is louder than the song mix", () => {
  const hits = lessonDrumHits(1, { bpm: 96, bars: 2 });
  const of = (voice) => hits.filter((hit) => hit.voice === voice);
  const sixteenth = 60 / 96 / 4;
  assert.deepEqual(
    of("kick").map((hit) => Math.round(hit.at / sixteenth)),
    [0, 4, 8, 12, 16, 20, 24, 28]
  );
  assert.deepEqual(
    of("openHat").map((hit) => Math.round(hit.at / sixteenth) % 4),
    Array(8).fill(2)
  );
  assert.equal(of("closedHat").length, 16);
  assert(of("kick").every((hit) => hit.volume === LESSON_STEPS[1].mix.kick * LESSON_GAIN));
  assert.deepEqual(
    of("bass").slice(0, 5).map((hit) => hit.frequency),
    [110, 110, 110, 220, 110]
  );
  assert.equal(lessonDrumHits(0, { bpm: 96, bars: 1 }).filter((hit) => hit.voice === "openHat").length, 0);
  assert.equal(LESSON_BARS.listen < LESSON_BARS.attempt, true);
});

test("one-bar notation beams eighths, keeps a sixteenth stub after a dotted eighth and rests empty beats", () => {
  const quarters = layoutRhythmBar([0, 4, 8, 12]);
  assert(quarters.every((beat) => beat.notes.length === 1 && beat.flags === 0 && !beat.beams.length));
  const eighths = layoutRhythmBar([0, 2]);
  assert.deepEqual(eighths[0].notes.map((note) => [note.duration, note.color]), [[2, 0], [2, 1]]);
  assert.deepEqual(eighths[0].beams.map((beam) => beam.level), [0]);
  assert.deepEqual(eighths[1].rests, [{ length: 4, x: eighths[1].rests[0].x }]);
  const dotted = layoutRhythmBar([0, 3])[0];
  assert.deepEqual(dotted.notes.map((note) => note.duration), [3, 1]);
  const stub = dotted.beams.find((beam) => beam.level === 1);
  assert.equal(stub.x2, dotted.notes[1].stemX);
  assert(stub.x1 < stub.x2);
  const mixed = layoutRhythmBar([4, 6, 7])[1];
  assert.deepEqual(mixed.notes.map((note) => note.duration), [2, 1, 1]);
  assert.deepEqual(mixed.beams.filter((beam) => beam.level === 1).length, 1);
  const offbeat = layoutRhythmBar([2])[0];
  assert.deepEqual(offbeat.rests.map((rest) => rest.length), [2]);
  assert.equal(offbeat.flags, 1);
  assert.deepEqual([0, 1, 2, 3, 4].map(countLabel), ["1", "e", "&", "a", "2"]);
  assert.equal(noteColor(3), 2);
});

test("the renderer can print sound names above germs", () => {
  const printed = [];
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx: {},
    reducedMotion: true,
    labels: NOTE_SYLLABLES,
    sprite() {},
    text(value) {
      printed.push(value);
    }
  });
  renderer.germ({ lane: "left", state: "waiting", at: 2, travelDuration: 1.25, step: 0, color: 1 }, 1.5);
  assert.deepEqual(printed, ["착"]);
  renderer.labels = null;
  renderer.germ({ lane: "left", state: "waiting", at: 2, travelDuration: 1.25, step: 0, color: 0 }, 1.5);
  assert.deepEqual(printed, ["착"]);
});

test("the extra swing step teaches green 따 on the last third of each beat", () => {
  const index = LESSON_STEPS.findIndex((step) => step.key === "tta");
  const step = LESSON_STEPS[index];
  assert.equal(step.extra, true);
  assert.equal(NOTE_SYLLABLES[step.color], "따");
  assert.deepEqual(CORE_LESSON_STEPS, [0, 1, 2]);
  const chart = createLessonChart(index, { bpm: 144, bars: 1 });
  assert.deepEqual(
    chart.events.map((event) => noteColor(event.step)),
    [0, 3, 0, 3, 0, 3, 0, 3]
  );
  // 따는 박의 2/3 자리다. 144 BPM이면 쿵 뒤 278ms, 다음 쿵 앞 139ms다.
  const beat = 60 / 144;
  assert.ok(Math.abs(chart.events[1].sample / chart.sampleRateHz - (beat * 2) / 3) < 1e-9);
  const hats = lessonDrumHits(index, { bpm: 144, bars: 1 }).filter((hit) => hit.voice === "closedHat");
  assert.deepEqual(
    hats.map((hit) => Math.round((hit.at / beat) * 3)),
    [2, 5, 8, 11]
  );
  assert.deepEqual(lessonTempos(index).map((tempo) => tempo.bpm), [72, 96, 144]);
  assert.equal(lessonBpm(index, 128), 144);
  assert.equal(lessonBpm(0, 144), 128);
  assert.equal(lessonBpm(index, 96), 96);
});

test("triplet notes are laid out inside their beat, marked 3 and counted 트, 렛", () => {
  const [first] = layoutRhythmBar([0, 8 / 3]);
  assert.equal(first.triplet, true);
  assert.deepEqual(first.notes.map((note) => note.step), [0, 8 / 3]);
  assert.deepEqual(first.notes.map((note) => note.color), [0, 3]);
  assert.equal(first.beams.length, 1);
  assert.equal(layoutRhythmBar([0, 2])[0].triplet, false);
  assert.deepEqual([4 / 3, 8 / 3].map(countLabel), ["트", "렛"]);
});

test("the score highlight follows the nearest pattern note, including triplet positions", () => {
  const swing = [0, 4, 8, 12].flatMap((beat) => [beat, beat + 8 / 3]);
  assert.equal(scoreStepAt(swing, 2.7), 8 / 3);
  assert.equal(scoreStepAt(swing, 16 + 0.2), 0);
  assert.equal(scoreStepAt(swing, 1.3), -1);
  assert.equal(scoreStepAt(swing, -1), -1);
  // 16분 패턴은 이전처럼 가장 가까운 칸의 음표만 굵게 한다.
  assert.equal(scoreStepAt([0, 3, 4, 7], 2.6), 3);
  assert.equal(scoreStepAt([0, 3, 4, 7], 1.4), -1);
});
