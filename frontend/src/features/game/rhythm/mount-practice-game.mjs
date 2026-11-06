import { LEVELS } from "./engine.mjs";
import { createPracticeRun, summarizePracticeRun } from "./practice-session.mjs";
import { MusicTransport } from "./audio.mjs";
import { Renderer } from "./render.mjs";
import { SyncCalibrationUI } from "./sync-ui.mjs";
import { readOffset, writeOffset } from "./calibration.mjs";
import { NOTE_SYLLABLES } from "./lesson.mjs";

export function mountPracticeGame({ root, onReady, onError, onPlayingChange }) {
  const document = root.ownerDocument;
  const lifetime = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const $ = (id) => root.querySelector("#" + id);
  const canvas = $("arena");
  const startButton = $("start");
  const pauseButton = $("pause");
  const overlay = $("overlay");
  const scoreText = $("score");
  const comboText = $("combo");
  const lifeText = $("lives");
  const positionText = $("position");
  const loopText = $("loop-info");
  const choices = [...root.querySelectorAll("[data-level]")];
  let level = "easy";
  let practiceRun = null;
  let state = "loading";
  let engine = null;
  let renderer = null;
  let transport = null;
  let chart = null;
  let lastHud = -1;
  let lastFrame = 0;
  let actionPending = false;
  let restartRequested = false;
  let syncCalibration = null;
  let syncRequested = false;
  let disposed = false;
  let frameRequest = null;
  let audioContext = null;
  let offsetStorage;
  try {
    offsetStorage = window.localStorage;
  } catch {
    /* Storage can be disabled by the browser. */
  }
  $("offset").value = String(readOffset(offsetStorage));
  updateOffsetLabel();

  function updateOffsetLabel() {
    const value = Number($("offset").value);
    $("offset-value").textContent = (value > 0 ? "+" : "") + value + "ms";
  }

  function applyOffset(value) {
    $("offset").value = String(value);
    updateOffsetLabel();
    const saved = writeOffset(offsetStorage, value);
    $("offset-hint").textContent = saved
      ? "이 브라우저에 저장했어요. 이어폰이나 키보드를 바꾸면 다시 진단해요."
      : "현재 값은 적용됐어요. 새로고침하면 다시 맞춰야 해요.";
    return saved;
  }

  function setLife(lives, maximum) {
    lifeText.replaceChildren(
      ...Array.from({ length: maximum }, (_, index) => {
        const heart = document.createElement("span");
        heart.textContent = "♥";
        heart.className = index < lives ? "" : "life-off";
        heart.setAttribute("aria-hidden", "true");
        return heart;
      })
    );
    lifeText.setAttribute("aria-label", "라이프 " + lives + "개");
  }

  function finishAction() {
    actionPending = false;
    if (disposed) return;
    if (restartRequested) {
      restartRequested = false;
      void begin(true);
    } else if (syncRequested) {
      syncRequested = false;
      void syncCalibration.open();
    }
  }

  function restartFromSettings() {
    if (state === "running" || state === "paused" || state === "starting") {
      void begin(true);
    }
  }

  function focusGame(scroll = false) {
    if (scroll) canvas.scrollIntoView({ block: "center", behavior: "auto" });
    canvas.focus({ preventScroll: true });
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
  }

  function updateHud(time, force = false) {
    if (!engine) return;
    if (!force && time - lastHud < 0.075) return;
    lastHud = time;
    scoreText.textContent = engine.score.toLocaleString("ko-KR");
    comboText.textContent = engine.combo;
    setLife(engine.lives, engine.maxLives);
    const loop = engine.currentLoop(time);
    const inCount = time < engine.loops[0].start;
    const songTime = Math.max(0, (time - loop.start) * loop.rate + loop.offset);
    const bar = Math.min(48, Math.floor(songTime / ((60 / chart.bpm) * 4)) + 1);
    positionText.textContent = inCount
      ? time < engine.countInStart
        ? "준비 중"
        : "네 박 뒤 시작"
      : formatTime(songTime) + " / 1:30  / " + bar + "마디";
    loopText.textContent =
      "LOOP " + String(loop.number).padStart(2, "0") + " / 곡 ×" + loop.rate.toFixed(2);
  }

  function showOverlay(title, copy, action, kicker) {
    $("overlay-title").textContent = title;
    $("overlay-copy").textContent = copy;
    $("overlay-kicker").textContent = kicker;
    startButton.textContent = action;
    overlay.hidden = false;
  }

  async function begin(restart = false) {
    if (!transport || disposed) return;
    if (actionPending) {
      if (restart) restartRequested = true;
      return;
    }
    if (state === "paused" && !restart) {
      await resume();
      return;
    }
    actionPending = true;
    state = "starting";
    startButton.disabled = true;
    pauseButton.disabled = true;
    try {
      practiceRun = createPracticeRun(chart, { level, scrollSpeed: Number($("rate").value) });
      engine = practiceRun.engine;
      await transport.start(engine.loops);
      if (disposed) {
        transport.stop();
        return;
      }
      if (restartRequested) return;
      transport.countIn(engine);
      renderer.effects = [];
      renderer.lastHit = null;
      renderer.hurtUntil = -1;
      state = "running";
      onPlayingChange?.(true);
      lastHud = -Infinity;
      overlay.hidden = true;
      $("load-status").textContent = "";
      pauseButton.disabled = false;
      pauseButton.textContent = "일시정지";
      $("restart").disabled = false;
      focusGame(true);
      $("announcer").textContent =
        LEVELS[engine.level].name + ", 라이프 " + engine.maxLives + "개. 네 박 뒤 시작.";
    } catch (error) {
      if (disposed) return;
      transport.stop();
      state = "ready";
      onPlayingChange?.(false);
      $("load-status").textContent = "시작하지 못했어요. " + error.message;
      showOverlay("시작하지 못했어요", error.message, "다시 시도", "RETRY");
    } finally {
      startButton.disabled = false;
      finishAction();
    }
  }

  async function pause(moveFocus = true) {
    if (state !== "running" || actionPending) return;
    actionPending = true;
    state = "paused";
    onPlayingChange?.(false);
    pauseButton.textContent = "계속하기";
    showOverlay("잠깐 쉬어가기", "준비되면 음악과 함께 이어가요.", "계속하기", "PAUSED");
    if (moveFocus) startButton.focus({ preventScroll: true });
    try {
      await transport.pause();
    } finally {
      finishAction();
    }
  }

  async function resume() {
    if (state !== "paused" || actionPending) return;
    actionPending = true;
    try {
      await transport.resume();
      if (disposed) return;
      state = "running";
      onPlayingChange?.(true);
      overlay.hidden = true;
      pauseButton.textContent = "일시정지";
      focusGame(true);
    } finally {
      finishAction();
    }
  }

  function endRun() {
    state = "over";
    onPlayingChange?.(false);
    transport.stop();
    pauseButton.disabled = true;
    updateHud(engine.elapsed, true);
    const loop = engine.currentLoop(engine.elapsed);
    const result = summarizePracticeRun(practiceRun);
    const copy =
      loop.number +
      "루프 / 최고 콤보 " +
      engine.bestCombo +
      " / Perfect " +
      engine.stats.perfect +
      " / 헛공격 " +
      engine.stats.poor;
    showOverlay(
      "게임 오버",
      copy + " / 연습 점수 " + result.score.toLocaleString("ko-KR"),
      "다시 도전",
      "PRACTICE COMPLETE"
    );
    $("announcer").textContent = "게임 오버. 점수 " + engine.score + "점.";
  }

  function input(lane, stamp = performance.now()) {
    if (state !== "running" || engine.autoplay) return;
    const offset = Number($("offset").value) / 1000;
    const raw = transport.timeAt(stamp);
    engine.input(lane, raw - offset);
    renderer.receive(engine.drainEffects());
    updateHud(transport.timeAt(), true);
  }

  function frame(stamp) {
    if (disposed) return;
    syncCalibration?.tick(stamp);
    if (state === "running" && transport && engine) {
      if (stamp - lastFrame > 750 && lastFrame > 0) {
        pause();
      } else {
        const time = transport.timeAt(stamp);
        engine.tick(time);
        transport.schedule(engine.loops);
        renderer.receive(engine.drainEffects());
        renderer.draw(time, engine);
        updateHud(time);
        if (engine.dead) endRun();
      }
    } else if (renderer) {
      renderer.draw(engine ? engine.elapsed : 0, engine);
    }
    lastFrame = stamp;
    frameRequest = requestAnimationFrame(frame);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    state = "disposed";
    restartRequested = false;
    syncRequested = false;
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    syncCalibration?.cancel();
    if ($("sync-dialog").open) $("sync-dialog").close();
    transport?.stop();
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {});
  }

  listen(window, "pagehide", dispose);
  listen(window, "blur", () => {
    if (syncCalibration?.isMeasuring)
      syncCalibration.cancel("게임 밖으로 이동해 측정을 중단했어요. 다시 측정해요.");
    if (state === "running") void pause(false);
  });
  listen(root, "focusout", (event) => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) {
      if (syncCalibration?.isMeasuring)
        syncCalibration.cancel("게임 밖으로 이동해 측정을 중단했어요. 다시 측정해요.");
      if (state === "running") void pause(false);
    }
  });

  choices.forEach((button) =>
    listen(button, "click", () => {
      level = button.dataset.level;
      choices.forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
      $("difficulty-copy").textContent = LEVELS[level].description;
      setLife(LEVELS[level].lives, LEVELS[level].lives);
      restartFromSettings();
    })
  );

  listen(
    window,
    "keydown",
    (event) => {
      if (!root.contains(event.target)) return;
      if (syncCalibration?.isOpen) {
        syncCalibration.handleKey(event);
        return;
      }
      if (event.target?.tagName === "SELECT") return;
      const keys = {
        ArrowLeft: "left",
        ArrowDown: "down",
        ArrowRight: "right",
        ArrowUp: "up",
        KeyA: "left",
        KeyS: "down",
        KeyD: "right",
        KeyW: "up",
        a: "left",
        s: "down",
        d: "right",
        w: "up"
      };
      const lane = keys[event.code] || keys[event.key] || keys[event.key?.toLowerCase()];
      const gameOverInput = state === "over" && event.target === canvas;
      if (lane && (state === "running" || gameOverInput)) {
        event.preventDefault();
        event.stopPropagation();
        if (state === "running" && !event.repeat && !event.isComposing)
          input(lane, event.timeStamp);
      } else if (event.key === "Enter" && gameOverInput) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && !event.isComposing) void begin();
      } else if (event.key === "Escape" && (state === "running" || state === "paused")) {
        event.preventDefault();
        event.stopPropagation();
        state === "running" ? pause() : resume();
      }
    },
    { capture: true }
  );

  listen(canvas, "pointerdown", () => focusGame());
  listen($("rate"), "change", restartFromSettings);

  for (const button of root.querySelectorAll("[data-lane]")) {
    listen(button, "pointerdown", (event) => {
      event.preventDefault();
      input(button.dataset.lane, event.timeStamp);
    });
  }
  listen(document, "visibilitychange", () => {
    if (document.hidden && syncCalibration?.isMeasuring)
      syncCalibration.cancel("탭을 벗어나 측정을 중단했어요. 돌아와서 다시 측정해요.");
    if (document.hidden && state === "running") pause(false);
  });
  listen(startButton, "click", () => begin());
  listen(pauseButton, "click", () => (state === "paused" ? resume() : pause()));
  listen($("restart"), "click", () => begin(true));
  listen($("volume"), "input", () => {
    $("volume-value").textContent = $("volume").value + "%";
    if (transport) transport.gain.gain.value = Number($("volume").value) / 100;
  });
  listen($("offset"), "input", () => {
    applyOffset(Number($("offset").value));
  });
  listen($("timing-feedback"), "change", () => {
    if (renderer) renderer.showTiming = $("timing-feedback").checked;
  });
  listen($("note-labels"), "change", () => {
    if (renderer) renderer.labels = $("note-labels").checked ? NOTE_SYLLABLES : null;
  });

  async function load() {
    try {
      const spritePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("스프라이트를 불러올 수 없어요."));
        image.src = "/game-assets/rhythm-harpoon/assets/sprites.png";
      });
      const [loadedChart, bytes, sprites] = await Promise.all([
        fetch("/game-assets/rhythm-harpoon/assets/chart.json?v=climax-order-4", {
          signal: lifetime.signal
        }).then((response) => {
          if (!response.ok) throw new Error("채보를 불러올 수 없어요.");
          return response.json();
        }),
        fetch("/game-assets/rhythm-harpoon/assets/pixel-circuit.ogg?v=spiral-melody-5", {
          signal: lifetime.signal
        }).then((response) => {
          if (!response.ok) throw new Error("음악을 불러올 수 없어요.");
          return response.arrayBuffer();
        }),
        spritePromise
      ]);
      if (disposed) return;
      chart = loadedChart;
      const context = new AudioContext({ latencyHint: "interactive" });
      audioContext = context;
      const buffer = await context.decodeAudioData(bytes);
      if (disposed) return;
      if (Math.abs(buffer.duration - chart.durationSeconds) > 0.005)
        throw new Error("음악과 채보 길이가 맞지 않아요.");
      transport = new MusicTransport(context, buffer);
      renderer = new Renderer(canvas, sprites);
      renderer.showTiming = $("timing-feedback").checked;
      renderer.labels = $("note-labels").checked ? NOTE_SYLLABLES : null;
      syncCalibration = new SyncCalibrationUI({
        document: { getElementById: $ },
        signal: lifetime.signal,
        createContext: () => new AudioContext({ latencyHint: "interactive" }),
        beforeOpen: async () => {
          if (actionPending) {
            syncRequested = true;
            return false;
          }
          if (state === "running") await pause();
          return true;
        },
        getOffset: () => Number($("offset").value),
        applyOffset
      });
      $("sync-open").disabled = false;
      state = "ready";
      setLife(LEVELS[level].lives, LEVELS[level].lives);
      loopText.textContent = "LOOP 01 / 곡 ×1.00";
      startButton.disabled = false;
      startButton.textContent = "플레이";
      $("load-status").textContent = "이어폰을 끼고 화살표 또는 WASD로 플레이하세요.";
      frameRequest = requestAnimationFrame(frame);
      onReady();
    } catch (error) {
      if (disposed) return;
      if (audioContext && audioContext.state !== "closed")
        void audioContext.close().catch(() => {});
      state = "error";
      $("load-status").textContent = error.message;
      startButton.textContent = "새로고침 후 다시 시도";
      onError();
    }
  }
  load();

  return dispose;
}
