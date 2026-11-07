import { GameEngine } from "./engine.mjs";
import { MusicTransport } from "./audio.mjs";
import { Renderer } from "./render.mjs";
import { SPRITE_ATLAS } from "./sprite-atlas.mjs";
import { readOffset } from "./calibration.mjs";
import {
  LESSON_BARS,
  NOTE_SYLLABLES,
  createLessonChart,
  lessonEndOffset,
  summarizeLesson
} from "./lesson.mjs";
import { renderLessonTrack } from "./lesson-audio.mjs";
import { laneForKey, readKeymap } from "./preferences.mjs";

const SPRITE_URL = SPRITE_ATLAS.url;

// 따라 하기 실행 수명: 판 그리기, 드럼 비트, 입력과 판정을 묶고 화면을 떠나면 모두 정리한다.
export function mountLessonGame({ root, onReady, onError, onFinish, onUpcoming }) {
  const document = root.ownerDocument;
  const view = document.defaultView || globalThis;
  const lifetime = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const canvas = root.querySelector("[data-lesson-arena]");
  let renderer = null;
  let context = null;
  let transport = null;
  let engine = null;
  let run = null;
  let state = "loading";
  let disposed = false;
  let frameRequest = null;
  let lastFrame = 0;
  let generation = 0;
  let upcomingKey = "";
  let litStep = -1;
  let offset = 0;
  let keymap = readKeymap(null);
  try {
    offset = readOffset(view.localStorage) / 1000;
    // 연습 화면에서 바꾼 키 배치를 따라 하기에도 그대로 쓴다.
    keymap = readKeymap(view.localStorage);
  } catch {
    offset = 0;
  }

  function highlight(step) {
    if (step === litStep) return;
    litStep = step;
    for (const head of root.querySelectorAll("[data-score-step]"))
      head.classList.toggle("is-on", Number(head.dataset.scoreStep) === step);
  }

  function stopRun() {
    generation++;
    if (transport) {
      transport.stop();
      transport.gain.disconnect();
      transport = null;
    }
    run = null;
    if (state === "running" || state === "starting") state = "ready";
    highlight(-1);
  }

  async function play({ stepIndex, bpm, scrollSpeed, auto = false }) {
    if (disposed || state === "loading" || state === "error") return false;
    stopRun();
    const token = generation;
    state = "starting";
    try {
      const bars = auto ? LESSON_BARS.listen : LESSON_BARS.attempt;
      const chart = createLessonChart(stepIndex, { bpm, bars });
      const nextEngine = new GameEngine(chart, {
        level: "easy",
        events: chart.events,
        scrollSpeed,
        autoplay: auto
      });
      // 사용자가 누른 직후 오디오를 만들어야 브라우저가 재생을 막지 않는다.
      context ??= new (view.AudioContext || view.webkitAudioContext)({ latencyHint: "interactive" });
      void context.resume();
      const Offline = view.OfflineAudioContext || view.webkitOfflineAudioContext;
      const buffer = await renderLessonTrack(
        (channels, length, rate) => new Offline(channels, length, rate),
        stepIndex,
        { bpm, bars }
      );
      if (disposed || token !== generation) return false;
      transport = new MusicTransport(context, buffer);
      const started = await transport.start(nextEngine.loops);
      if (!started || disposed || token !== generation) {
        transport.stop();
        return false;
      }
      transport.countIn(nextEngine);
      engine = nextEngine;
      run = {
        stepIndex,
        auto,
        endAt: engine.loops[0].start + lessonEndOffset(chart),
        sixteenth: 60 / bpm / 4
      };
      renderer.effects = [];
      renderer.lastHit = null;
      renderer.hurtUntil = -1;
      renderer.lastHeal = null;
      upcomingKey = "";
      state = "running";
      canvas.focus({ preventScroll: true });
      return true;
    } catch (error) {
      if (disposed || token !== generation) return false;
      transport?.stop();
      state = "ready";
      onFinish({ stepIndex, auto, error: error?.message || "따라 하기를 시작하지 못했어요." });
      return false;
    }
  }

  function finish(interrupted = false) {
    const current = run;
    if (!current) return;
    const summary = interrupted ? null : summarizeLesson(engine);
    stopRun();
    onFinish(
      interrupted
        ? { stepIndex: current.stepIndex, auto: current.auto, interrupted: true }
        : { ...summary, stepIndex: current.stepIndex, auto: current.auto }
    );
  }

  function input(lane, stamp) {
    if (state !== "running" || !engine || engine.autoplay) return;
    engine.input(lane, transport.timeAt(stamp) - offset);
    renderer.receive(engine.drainEffects());
  }

  function reportUpcoming(time) {
    const loop = engine.loops[0].number;
    const next = engine.notes
      .filter((note) => note.loop === loop && note.state === "waiting" && note.at >= time - 0.15)
      .slice(0, 7);
    const key = next.map((note) => note.step).join(",");
    if (key === upcomingKey) return;
    upcomingKey = key;
    onUpcoming?.(next.map((note) => note.color));
  }

  function frame(stamp) {
    if (disposed) return;
    if (state === "running" && engine) {
      // 탭이 백그라운드로 가서 프레임이 끊기면 이번 시도는 무효로 돌린다.
      if (lastFrame > 0 && stamp - lastFrame > 750) finish(true);
      else {
        const time = transport.timeAt(stamp);
        engine.tick(time);
        renderer.receive(engine.drainEffects());
        renderer.draw(time, engine);
        reportUpcoming(time);
        const songTime = time - engine.loops[0].start;
        highlight(
          songTime >= -run.sixteenth / 2 ? Math.floor(songTime / run.sixteenth + 0.5) % 16 : -1
        );
        if (engine.dead || time >= run.endAt) finish();
      }
    } else if (renderer) {
      renderer.draw(engine ? engine.elapsed : 0, engine);
    }
    lastFrame = stamp;
    frameRequest = view.requestAnimationFrame(frame);
  }

  function interrupt() {
    if (state === "running") finish(true);
    else if (state === "starting") stopRun();
  }

  listen(view, "pagehide", dispose);
  listen(view, "blur", interrupt);
  listen(document, "visibilitychange", () => {
    if (document.hidden) interrupt();
  });
  listen(root, "focusout", (event) => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) interrupt();
  });
  listen(
    view,
    "keydown",
    (event) => {
      // 진행 중에 Esc를 누르면 화면을 떠나기 전에 먼저 멈춘다. 멈춘 뒤의 Esc는 화면이 이전 단계로 돌아가는 데 쓴다.
      if (event.key === "Escape" && (state === "running" || state === "starting")) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) interrupt();
        return;
      }
      if (!root.contains(event.target)) return;
      const lane = laneForKey(keymap, event);
      if (!lane || state !== "running") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !event.isComposing) input(lane, event.timeStamp);
    },
    { capture: true }
  );
  listen(canvas, "pointerdown", () => canvas.focus({ preventScroll: true }));
  for (const button of root.querySelectorAll("[data-lane]")) {
    listen(button, "pointerdown", (event) => {
      event.preventDefault();
      input(button.dataset.lane, event.timeStamp);
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;
    lifetime.abort();
    if (frameRequest !== null) view.cancelAnimationFrame(frameRequest);
    transport?.stop();
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  const sprites = new view.Image();
  sprites.onload = () => {
    if (disposed) return;
    renderer = new Renderer(canvas, sprites);
    renderer.labels = NOTE_SYLLABLES;
    state = "ready";
    frameRequest = view.requestAnimationFrame(frame);
    onReady?.();
  };
  sprites.onerror = () => {
    if (disposed) return;
    state = "error";
    onError?.();
  };
  sprites.src = SPRITE_URL;

  return {
    play,
    stop: () => {
      if (state === "running" || state === "starting") stopRun();
    },
    dispose
  };
}
