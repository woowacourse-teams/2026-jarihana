import { LANES, LEVELS } from "../engine.mjs";
import { MusicTransport } from "../audio.mjs";
import { Renderer, loopHealAnnouncement } from "../render.mjs";
import { SPRITE_ATLAS } from "../sprite-atlas.mjs";
import { NOTE_SYLLABLES } from "../lesson.mjs";
import { laneForKey } from "../preferences.mjs";
import { RankedBatchSender, RankedInputLog, applyRankedInput, createRankedEngine } from "../ranked-run.mjs";
import { STAGES, stageOf } from "../stages.mjs";

// 대전은 상대 판을 다시 그려야 하므로 랭킹 도전(2초)보다 자주 입력을 보낸다.
export const BATTLE_BATCH_SECONDS = 0.5;
// 상대 판은 받은 입력으로 다시 그리므로 이만큼 늦게 보여 준다. 입력 묶음 주기와 실시간 연결 확인 주기를 더한 값이다.
export const RIVAL_DELAY_SECONDS = 1.2;

// 상대가 보낸 입력 묶음을 순번대로 쌓아 두고, 화면 시각이 지난 입력만 같은 시드의 엔진에 넣는다.
// 받은 묶음의 진행 시각보다 앞으로는 진행하지 않으므로, 아직 오지 않은 입력을 놓친 것으로 그리지 않는다.
export class RivalReplay {
  constructor(engine) {
    this.engine = engine;
    this.queue = [];
    this.knownUntil = 0;
    this.sequence = 0;
  }

  receive(batches) {
    for (const batch of [...batches].sort((a, b) => a.sequence - b.sequence)) {
      if (batch.sequence <= this.sequence) continue;
      for (const [lane, at] of batch.inputs) this.queue.push([LANES[lane], at]);
      this.knownUntil = Math.max(this.knownUntil, batch.playedUntil);
      this.sequence = batch.sequence;
    }
  }

  advance(time) {
    const until = Math.min(time, this.knownUntil);
    while (this.queue.length && this.queue[0][1] <= until) {
      const [lane, at] = this.queue.shift();
      applyRankedInput(this.engine, lane, at);
    }
    if (until > this.engine.elapsed) this.engine.tick(until);
    return until;
  }
}

// 대전 한 판을 실행한다. 서버가 정한 공통 시작 시각에 음악을 맞춰 틀고, 내 입력을 0.5초마다 보낸다.
// 라이프를 모두 잃으면 내 판은 멈추고 상대 판을 계속 보여 준다. Esc나 화면 이탈은 기권이다.
// 판의 승패는 서버가 정하며, 방이 끝나면 화면이 end()를 불러 판을 멈춘다.
export function mountBattleGame({
  root,
  game,
  api,
  keymap,
  offsetMs,
  volume,
  showTiming,
  showLabels,
  serverOffset,
  onReady,
  onRunning,
  onOut,
  onError
}) {
  const document = root.ownerDocument;
  const lifetime = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const $ = (id) => root.querySelector("#" + id);
  const canvas = $("arena");
  const rivalCanvas = $("rival-arena");
  const countdown = $("battle-countdown");
  const audioButton = $("battle-audio");
  const offset = offsetMs / 1000;
  const log = new RankedInputLog();
  let state = "loading";
  let engine = null;
  let renderer = null;
  let rival = null;
  let rivalRenderer = null;
  let transport = null;
  let audioContext = null;
  let frameRequest = null;
  let batchTimer = null;
  let lastFrame = 0;
  let lastHud = -Infinity;
  let announcedHeal = null;
  let disposed = false;
  let pendingRival = [];

  const sender = new RankedBatchSender({
    send: (batch) => api.submit(game.roomId, game.gameNumber, batch),
    onResponse: (result) => {
      if (result.status === "OUT" && (state === "running" || state === "ready" || state === "ending")) {
        out(result);
      }
    },
    onFailure: (error) => {
      const playing = state === "running" || state === "ready";
      stopBatches();
      if (!playing) return;
      state = "out";
      void api.forfeit(game.roomId, game.gameNumber).catch(() => {});
      onError(error);
    }
  });

  function hearts(element, lives, maximum) {
    element.replaceChildren(
      ...Array.from({ length: maximum }, (_, index) => {
        const heart = document.createElement("span");
        heart.textContent = "♥";
        heart.className = index < lives ? "" : "life-off";
        heart.setAttribute("aria-hidden", "true");
        return heart;
      })
    );
    element.setAttribute("aria-label", "라이프 " + lives + "개");
  }

  function updateHud(time, force = false) {
    if (!engine || (!force && time - lastHud < 0.075)) return;
    lastHud = time;
    $("score").textContent = engine.score.toLocaleString("ko-KR");
    $("combo").textContent = engine.combo;
    hearts($("lives"), engine.lives, engine.maxLives);
    const heal = engine.loopHeals.at(-1);
    if (heal && heal !== announcedHeal) {
      announcedHeal = heal;
      $("announcer").textContent = loopHealAnnouncement(heal);
    }
    if (rival) {
      $("rival-score").textContent = rival.engine.score.toLocaleString("ko-KR");
      $("rival-combo").textContent = rival.engine.combo;
      hearts($("rival-lives"), rival.engine.lives, rival.engine.maxLives);
    }
  }

  const songTime = (stamp) => transport.timeAt(stamp) - offset;

  function flush(finished = false) {
    if (state !== "running" && !finished) return;
    const until = finished ? engine.elapsed : songTime();
    // 곡이 시작되기 전(카운트다운)에는 보내지 않는다. 서버는 0초보다 앞선 진행 시각을 받지 않는다.
    if (!finished && !(until > 0)) return;
    const batch = log.take(until);
    void sender.push(finished ? { ...batch, finished: true } : batch);
  }

  function stopBatches() {
    if (batchTimer !== null) clearInterval(batchTimer);
    batchTimer = null;
  }

  // 내 판이 끝났다(탈락이나 시각 위반). 음악과 상대 판은 방이 끝날 때까지 계속 보여 준다.
  function out(result) {
    state = "out";
    stopBatches();
    sender.stop();
    onOut(result);
  }

  // Esc, 탭 전환, 창 이탈로 판을 떠났다. 대전에서는 기권으로 진다.
  function leave() {
    if (state !== "running" && state !== "ready") return;
    state = "left";
    stopBatches();
    sender.stop();
    transport?.stop();
    void api.forfeit(game.roomId, game.gameNumber).catch(() => {});
    onOut({ status: "OUT", outReason: "ABANDONED" });
  }

  async function unlockAudio() {
    const resumed = audioContext.resume().then(() => true);
    const quick = await Promise.race([resumed, new Promise((resolve) => setTimeout(() => resolve(false), 300))]);
    if (quick || disposed) return;
    // 이 화면에서 아직 아무것도 누르지 않았으면(초대 링크로 바로 들어온 경우 등) 브라우저가 소리를 막는다.
    // 버튼을 누를 때까지 기다리고, 시작까지 남은 시간은 소리를 켠 뒤에 다시 잰다.
    audioButton.hidden = false;
    await resumed;
    audioButton.hidden = true;
  }

  async function begin() {
    await unlockAudio();
    if (disposed || state !== "ready") return;
    // 실시간 연결을 늦게 받아도 공통 시작 시각 기준으로 곡을 맞춘다. 이미 지났으면 바로 튼다.
    const startIn = (game.startsAt - (Date.now() + serverOffset())) / 1000;
    const started = await transport.start(engine.loops, startIn);
    if (!started || disposed || state !== "ready") return;
    transport.countIn(engine);
    state = "running";
    lastFrame = 0;
    batchTimer = setInterval(() => flush(), BATTLE_BATCH_SECONDS * 1000);
    canvas.focus({ preventScroll: true });
    $("announcer").textContent =
      LEVELS[engine.level].name + ", 라이프 " + engine.maxLives + "개. 먼저 탈락하면 져요.";
    onRunning();
  }

  function input(lane, stamp) {
    if (state !== "running") return;
    const time = songTime(stamp);
    if (time < 0) return;
    const at = log.clamp(time);
    applyRankedInput(engine, lane, at);
    log.record(lane, at);
    renderer.receive(engine.drainEffects());
    updateHud(transport.timeAt(), true);
  }

  function drawRival(time) {
    if (!rival) return;
    const shown = rival.advance(time - RIVAL_DELAY_SECONDS);
    rivalRenderer.receive(rival.engine.drainEffects());
    rivalRenderer.draw(Math.max(0, shown), rival.engine);
  }

  function frame(stamp) {
    if (disposed) return;
    if (state === "running" || state === "out" || state === "ready") {
      const raw = transport.timeAt(stamp);
      countdown.hidden = !(raw < 0);
      if (raw < 0) countdown.textContent = String(Math.ceil(-raw));
      if (state === "running") {
        if (lastFrame > 0 && stamp - lastFrame > 750) {
          leave();
        } else if (raw >= 0) {
          // 판정은 서버와 같이 입력 지연 보정을 적용한 시각으로 진행하고, 그림은 음악 시각에 맞춘다.
          engine.tick(raw - offset);
          transport.schedule(engine.loops);
          renderer.receive(engine.drainEffects());
          if (engine.dead) {
            stopBatches();
            flush(true);
            state = "ending";
            $("announcer").textContent = "라이프를 모두 잃었어요. 서버에서 판정을 확인하고 있어요.";
          }
        }
      } else if (state === "out" && raw >= 0) {
        transport.schedule(engine.loops);
      }
      renderer.draw(Math.max(0, raw), engine);
      drawRival(Math.max(0, raw));
      updateHud(raw);
    } else if (renderer) {
      const time = transport ? Math.max(0, transport.timeAt(stamp)) : 0;
      renderer.draw(engine ? engine.elapsed : 0, engine);
      if (state === "ending") drawRival(time);
    }
    lastFrame = stamp;
    frameRequest = requestAnimationFrame(frame);
  }

  function end() {
    state = "ended";
    stopBatches();
    sender.stop();
    transport?.stop();
    countdown.hidden = true;
  }

  function dispose() {
    if (disposed) return;
    if (state === "running" || state === "ready") leave();
    disposed = true;
    lifetime.abort();
    sender.stop();
    stopBatches();
    transport?.stop();
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {});
  }

  function receiveRival(batches) {
    if (rival) rival.receive(batches);
    else pendingRival = pendingRival.concat(batches);
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
      if (state !== "running" && state !== "ready") return;
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
  listen(audioButton, "click", () => {
    void audioContext?.resume();
    canvas.focus({ preventScroll: true });
  });
  for (const button of root.querySelectorAll("[data-battle-lane]")) {
    listen(button, "pointerdown", (event) => {
      event.preventDefault();
      input(button.dataset.battleLane, event.timeStamp);
    });
  }

  async function load() {
    try {
      const stage = STAGES[stageOf(game.level)];
      if (stage.chartVersion !== game.chartVersion) {
        throw new Error("게임이 새로 바뀌었어요. 새로고침한 뒤 다시 들어와 주세요.");
      }
      const spritePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("스프라이트를 불러올 수 없어요."));
        image.src = SPRITE_ATLAS.url;
      });
      const [chart, bytes, sprites] = await Promise.all([
        fetch(stage.chart, { signal: lifetime.signal }).then((response) => {
          if (!response.ok) throw new Error("채보를 불러올 수 없어요.");
          return response.json();
        }),
        fetch(stage.music, { signal: lifetime.signal }).then((response) => {
          if (!response.ok) throw new Error("음악을 불러올 수 없어요.");
          return response.arrayBuffer();
        }),
        spritePromise
      ]);
      if (disposed) return;
      audioContext = new AudioContext({ latencyHint: "interactive" });
      const buffer = await audioContext.decodeAudioData(bytes);
      if (disposed) return;
      transport = new MusicTransport(audioContext, buffer);
      transport.gain.gain.value = volume / 100;
      engine = createRankedEngine(chart, { level: game.level, scrollSpeed: game.myScrollSpeed, seed: game.seed });
      rival = new RivalReplay(
        createRankedEngine(chart, { level: game.level, scrollSpeed: game.rivalScrollSpeed, seed: game.seed })
      );
      rival.receive(pendingRival);
      pendingRival = [];
      renderer = new Renderer(canvas, sprites);
      renderer.showTiming = showTiming;
      renderer.labels = showLabels ? NOTE_SYLLABLES : null;
      rivalRenderer = new Renderer(rivalCanvas, sprites);
      rivalRenderer.showTiming = false;
      rivalRenderer.restingExpression = 1;
      hearts($("lives"), engine.maxLives, engine.maxLives);
      hearts($("rival-lives"), engine.maxLives, engine.maxLives);
      state = "ready";
      frameRequest = requestAnimationFrame(frame);
      onReady();
      await begin();
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      state = "error";
      onError(error);
    }
  }
  void load();

  return { dispose, end, receiveRival };
}
