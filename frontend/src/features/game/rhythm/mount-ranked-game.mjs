import { LEVELS } from "./engine.mjs";
import { MusicTransport } from "./audio.mjs";
import { Renderer } from "./render.mjs";
import { SPRITE_ATLAS } from "./sprite-atlas.mjs";
import { NOTE_SYLLABLES } from "./lesson.mjs";
import { laneForKey } from "./preferences.mjs";
import {
  RANKED_BATCH_SECONDS,
  RANKED_CHART_VERSION,
  RankedBatchSender,
  RankedInputLog,
  applyRankedInput,
  assertRankedVersions,
  createRankedEngine
} from "./ranked-run.mjs";

const CHART_URL = "/game-assets/rhythm-harpoon/assets/chart.json?v=" + RANKED_CHART_VERSION;
const MUSIC_URL = "/game-assets/rhythm-harpoon/assets/pixel-circuit.ogg?v=spiral-melody-5";

// 공식 도전 한 판을 실행한다. 멈출 수 없고, Esc나 화면 이탈은 그 판을 무효로 만든다.
// 점수와 판정은 화면 표시용이며 기록은 서버가 입력 묶음으로 다시 계산한 결과만 쓴다.
export function mountRankedGame({
  root,
  session,
  api,
  keymap,
  offsetMs,
  volume,
  showTiming,
  showLabels,
  onReady,
  onRunning,
  onFinished,
  onInvalid,
  onError
}) {
  const document = root.ownerDocument;
  const lifetime = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const $ = (id) => root.querySelector("#" + id);
  const canvas = $("arena");
  const startButton = $("start");
  const overlay = $("overlay");
  const offset = offsetMs / 1000;
  const log = new RankedInputLog();
  let state = "loading";
  let engine = null;
  let renderer = null;
  let transport = null;
  let chart = null;
  let audioContext = null;
  let frameRequest = null;
  let batchTimer = null;
  let lastFrame = 0;
  let lastHud = -Infinity;
  let disposed = false;

  const sender = new RankedBatchSender({
    send: (batch) => api.submit(session.challengeId, batch),
    onResponse: (serverState, batch) => {
      if (serverState.status === "INVALID") {
        stopPlay();
        onInvalid(serverState.invalidReason ?? "ABANDONED");
      } else if (serverState.status === "FINISHED" || batch.finished) {
        stopPlay();
        state = "finished";
        onFinished(serverState);
      }
    },
    onFailure: (error) => {
      stopPlay();
      onError(error);
    }
  });

  function setLife(lives, maximum) {
    const lifeText = $("lives");
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

  function updateHud(time, force = false) {
    if (!engine || (!force && time - lastHud < 0.075)) return;
    lastHud = time;
    $("score").textContent = engine.score.toLocaleString("ko-KR");
    $("combo").textContent = engine.combo;
    setLife(engine.lives, engine.maxLives);
    const loop = engine.currentLoop(time);
    $("loop-info").textContent =
      "LOOP " + String(loop.number).padStart(2, "0") + " / 곡 ×" + loop.rate.toFixed(2);
  }

  const songTime = (stamp) => transport.timeAt(stamp) - offset;

  function flush(finished = false) {
    if (state !== "running" && !finished) return;
    const batch = log.take(finished ? engine.elapsed : songTime());
    void sender.push(finished ? { ...batch, finished: true } : batch);
  }

  function stopPlay() {
    if (batchTimer !== null) clearInterval(batchTimer);
    batchTimer = null;
    transport?.stop();
  }

  // 일시정지가 없으므로 판을 떠나면 바로 무효로 알린다.
  function leave() {
    if (state !== "running" && state !== "starting") return;
    state = "left";
    sender.stop();
    stopPlay();
    void api.abandon(session.challengeId).catch(() => {});
    onInvalid("ABANDONED");
  }

  async function begin() {
    if (state !== "ready" || disposed) return;
    state = "starting";
    startButton.disabled = true;
    try {
      engine = createRankedEngine(chart, {
        level: session.level,
        scrollSpeed: session.scrollSpeed,
        seed: session.seed
      });
      const started = await api.start(session.challengeId);
      if (disposed || state !== "starting") return;
      if (started.status !== "PLAYING") {
        onInvalid(started.invalidReason ?? "EXPIRED");
        return;
      }
      await transport.start(engine.loops);
      if (disposed || state !== "starting") {
        transport.stop();
        return;
      }
      transport.countIn(engine);
      state = "running";
      overlay.hidden = true;
      lastFrame = 0;
      batchTimer = setInterval(() => flush(), RANKED_BATCH_SECONDS * 1000);
      canvas.focus({ preventScroll: true });
      $("announcer").textContent =
        LEVELS[engine.level].name + ", 라이프 " + engine.maxLives + "개. 네 박 뒤 시작.";
      onRunning();
    } catch (error) {
      if (disposed) return;
      stopPlay();
      state = "error";
      onError(error);
    }
  }

  function input(lane, stamp) {
    if (state !== "running") return;
    const at = log.clamp(songTime(stamp));
    applyRankedInput(engine, lane, at);
    log.record(lane, at);
    renderer.receive(engine.drainEffects());
    updateHud(transport.timeAt(), true);
  }

  function frame(stamp) {
    if (disposed) return;
    if (state === "running") {
      // 화면이 멈췄다가 돌아오면 그사이 입력을 할 수 없었으므로 이탈로 본다.
      if (lastFrame > 0 && stamp - lastFrame > 750) {
        leave();
      } else {
        // 판정은 서버와 같이 입력 지연 보정을 적용한 시각으로 진행하고, 그림은 음악 시각에 맞춘다.
        const raw = transport.timeAt(stamp);
        engine.tick(raw - offset);
        transport.schedule(engine.loops);
        renderer.receive(engine.drainEffects());
        renderer.draw(raw, engine);
        updateHud(raw);
        if (engine.dead) {
          state = "ending";
          stopPlay();
          flush(true);
          $("announcer").textContent = "게임 오버. 서버에서 점수를 확인하고 있어요.";
        }
      }
    } else if (renderer) {
      renderer.draw(engine ? engine.elapsed : 0, engine);
    }
    lastFrame = stamp;
    frameRequest = requestAnimationFrame(frame);
  }

  function dispose() {
    if (disposed) return;
    if (state === "running" || state === "starting") leave();
    disposed = true;
    lifetime.abort();
    sender.stop();
    stopPlay();
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {});
  }

  listen(window, "pagehide", leave);
  listen(window, "blur", leave);
  listen(document, "visibilitychange", () => {
    if (document.hidden) leave();
  });
  listen(root, "focusout", (event) => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) leave();
  });
  listen(
    window,
    "keydown",
    (event) => {
      // 마지막 묶음의 서버 결과를 기다리는 동안 Esc가 화면을 바꿔 끝난 판을 버리지 않게 막는다.
      if (state === "ending" && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (state !== "running" && state !== "starting") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) leave();
        return;
      }
      const lane = laneForKey(keymap, event);
      if (!lane) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !event.isComposing) input(lane, event.timeStamp);
    },
    { capture: true }
  );
  listen(canvas, "pointerdown", () => canvas.focus({ preventScroll: true }));
  for (const button of root.querySelectorAll("[data-ranked-lane]")) {
    listen(button, "pointerdown", (event) => {
      event.preventDefault();
      input(button.dataset.rankedLane, event.timeStamp);
    });
  }
  listen(startButton, "click", () => void begin());

  async function load() {
    try {
      assertRankedVersions(session);
      const spritePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("스프라이트를 불러올 수 없어요."));
        image.src = SPRITE_ATLAS.url;
      });
      const [loadedChart, bytes, sprites] = await Promise.all([
        fetch(CHART_URL, { signal: lifetime.signal }).then((response) => {
          if (!response.ok) throw new Error("채보를 불러올 수 없어요.");
          return response.json();
        }),
        fetch(MUSIC_URL, { signal: lifetime.signal }).then((response) => {
          if (!response.ok) throw new Error("음악을 불러올 수 없어요.");
          return response.arrayBuffer();
        }),
        spritePromise
      ]);
      if (disposed) return;
      chart = loadedChart;
      audioContext = new AudioContext({ latencyHint: "interactive" });
      const buffer = await audioContext.decodeAudioData(bytes);
      if (disposed) return;
      if (Math.abs(buffer.duration - chart.durationSeconds) > 0.005)
        throw new Error("음악과 채보 길이가 맞지 않아요.");
      transport = new MusicTransport(audioContext, buffer);
      transport.gain.gain.value = volume / 100;
      renderer = new Renderer(canvas, sprites);
      renderer.showTiming = showTiming;
      renderer.labels = showLabels ? NOTE_SYLLABLES : null;
      setLife(LEVELS[session.level].lives, LEVELS[session.level].lives);
      state = "ready";
      startButton.disabled = false;
      frameRequest = requestAnimationFrame(frame);
      onReady();
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      state = "error";
      onError(error);
    }
  }
  void load();

  return dispose;
}
