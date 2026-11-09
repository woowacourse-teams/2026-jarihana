import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { LEVELS } from "../../../src/features/game/rhythm/engine.mjs";
import { SPRITE_ATLAS } from "../../../src/features/game/rhythm/sprite-atlas.mjs";
import {
  createPracticeRun,
  summarizePracticeRun
} from "../../../src/features/game/rhythm/practice-session.mjs";
import { SyncCalibrationUI } from "../../../src/features/game/rhythm/sync-ui.mjs";
import {
  readOffset,
  writeOffset,
  SYNC_CONFIG
} from "../../../src/features/game/rhythm/calibration.mjs";
import { NOTE_SYLLABLES } from "../../../src/features/game/rhythm/lesson.mjs";
import {
  DEFAULT_KEYMAP,
  isRetryKey,
  laneForKey,
  readPracticeSettings,
  writePracticeSettings
} from "../../../src/features/game/rhythm/preferences.mjs";

const source = readFileSync(
  new URL("../../../src/features/game/rhythm/mount-practice-game.mjs", import.meta.url),
  "utf8"
);
// 싱크 진단 창은 공식 도전과 함께 쓰는 SyncDialog.jsx로 분리했으므로 두 파일의 요소를 함께 읽는다.
const html = ["RhythmHarpoonGame.jsx", "SyncDialog.jsx"]
  .map((file) =>
    readFileSync(new URL("../../../src/features/game/rhythm/" + file, import.meta.url), "utf8")
  )
  .join("\n");
const chart = JSON.parse(
  readFileSync(
    new URL("../../../public/game-assets/rhythm-harpoon/assets/chart.json", import.meta.url),
    "utf8"
  )
);
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function application({
  storedOffset = 0,
  storedSettings,
  keyBindings,
  fetchReady,
  decodeReady,
  loading = false
} = {}) {
  const app = {
    frame: null,
    stamp: 0,
    contexts: [],
    cancelled: [],
    ready: false,
    requests: [],
    signals: new Set(),
    keyBindings
  };
  const register = (map, type, handler, options = {}) => {
    if (options.signal) app.signals.add(options.signal);
    map.set(type, (event) => {
      if (!options.signal?.aborted) return handler(event);
    });
  };
  const listeners = new Map();
  const documentListeners = new Map();
  const stored = new Map();
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };
  writeOffset(storage, storedOffset);
  if (storedSettings) writePracticeSettings(storage, storedSettings);
  class Element {
    constructor(tagName = "DIV") {
      this.tagName = tagName;
      this.dataset = {};
      this.listeners = new Map();
      this.value = "0";
      this.checked = false;
    }
    addEventListener(type, handler, options) {
      register(this.listeners, type, handler, options);
    }
    setAttribute() {}
    replaceChildren() {}
    scrollIntoView() {}
    focus() {
      document.activeElement = this;
    }
    showModal() {
      if (this.open) throw Error("dialog already open");
      this.open = true;
    }
    close() {
      this.open = false;
      this.listeners.get("close")?.();
    }
  }
  const elements = new Map(
    [...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()])
  );
  for (const id of ["rate"]) elements.get(id).tagName = "SELECT";
  elements.get("offset").tagName = "INPUT";
  elements.get("start").tagName = "BUTTON";
  elements.get("arena").tagName = "CANVAS";
  for (const [id, value] of [
    ["rate", "1.5"],
    ["sync-volume", "50"]
  ])
    elements.get(id).value = value;
  elements.get("sync-tap").tagName = "BUTTON";
  const choices = Object.keys(LEVELS).map((level) =>
    Object.assign(new Element("BUTTON"), { dataset: { level } })
  );
  const document = {
    activeElement: null,
    hidden: false,
    getElementById: (id) => elements.get(id),
    createElement: (tag) => new Element(tag.toUpperCase()),
    querySelectorAll: (selector) => (selector === "[data-level]" ? choices : []),
    addEventListener: (type, handler, options) =>
      register(documentListeners, type, handler, options)
  };
  const rootListeners = new Map();
  const serviceRoot = {
    ownerDocument: document,
    querySelector: (selector) => elements.get(selector.slice(1)),
    querySelectorAll: (selector) => document.querySelectorAll(selector),
    contains: (element) => [...elements.values(), ...choices].includes(element),
    addEventListener: (type, handler, options) => register(rootListeners, type, handler, options)
  };
  class Transport {
    constructor() {
      app.transport = this;
      this.time = 0;
      this.starts = 0;
      this.gain = { gain: { value: 0.65 } };
    }
    async start() {
      this.starts++;
      this.time = 0;
    }
    countIn() {}
    schedule() {}
    stop() {}
    timeAt() {
      return this.time;
    }
    async pause() {
      this.paused = true;
    }
    async resume() {
      this.paused = false;
    }
  }
  class Renderer {
    constructor() {
      this.effects = [];
    }
    receive() {}
    draw() {}
  }
  class Image {
    set src(value) {
      queueMicrotask(() => this.onload());
    }
  }
  class AudioContext {
    constructor() {
      this.currentTime = 10;
      this.state = "running";
      this.destination = {};
      app.contexts.push(this);
    }
    async decodeAudioData() {
      if (decodeReady) await decodeReady;
      return { duration: chart.durationSeconds };
    }
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {}
        },
        connect() {},
        disconnect() {}
      };
    }
    createOscillator() {
      return { frequency: { value: 0 }, connect() {}, start() {}, stop() {}, disconnect() {} };
    }
    async resume() {
      this.state = "running";
    }
    async close() {
      this.state = "closed";
    }
  }
  class TestSyncUI extends SyncCalibrationUI {
    constructor(options) {
      super(options);
      app.sync = this;
    }
  }
  app.dispose = runInNewContext(
    source
      .replace(/^import[\s\S]*?;\r?$/gm, "")
      .replace("export function mountPracticeGame", "function mountPracticeGame") +
      "\nmountPracticeGame({root:serviceRoot,onReady:()=>{app.ready=true;},onError:()=>{app.error=true;},keyBindings:app.keyBindings});",
    {
      app,
      serviceRoot,
      document,
      window: {
        localStorage: storage,
        addEventListener: (type, handler, options) => register(listeners, type, handler, options)
      },
      LEVELS,
      createPracticeRun: (...args) => {
        const run = createPracticeRun(...args);
        app.engine = run.engine;
        return run;
      },
      summarizePracticeRun,
      MusicTransport: Transport,
      Renderer,
      SPRITE_ATLAS,
      SyncCalibrationUI: TestSyncUI,
      readOffset,
      writeOffset,
      NOTE_SYLLABLES,
      DEFAULT_KEYMAP,
      isRetryKey,
      laneForKey,
      readPracticeSettings,
      writePracticeSettings,
      Image,
      AudioContext,
      AbortController,
      performance,
      fetch: async (url, options) => {
        app.requests.push({ url, options });
        if (fetchReady) await fetchReady;
        return { ok: true, json: async () => chart, arrayBuffer: async () => new ArrayBuffer(0) };
      },
      requestAnimationFrame: (callback) => {
        app.frame = callback;
        return 1;
      },
      cancelAnimationFrame: (id) => app.cancelled.push(id)
    }
  );
  await settle();
  if (!loading) assert.equal(elements.get("start").textContent, "플레이");
  app.get = (id) => elements.get(id);
  app.emit = (type, event = {}) => listeners.get(type)?.(event);
  app.focusOut = (target) => rootListeners.get("focusout")({ relatedTarget: target });
  app.document = document;
  app.storage = storage;
  app.hide = () => {
    document.hidden = true;
    documentListeners.get("visibilitychange")();
  };
  app.syncTime = (seconds) => {
    const audio = app.sync.audio;
    const timestamp = {
      contextTime: audio.baseTime + seconds,
      performanceTime: performance.now() + 1
    };
    audio.context.getOutputTimestamp = () => timestamp;
    return timestamp.performanceTime;
  };
  app.start = () => elements.get("start").listeners.get("click")();
  app.key = (key, options = {}) => {
    const event = {
      key,
      code: key,
      target: document.activeElement,
      timeStamp: performance.now(),
      repeat: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      ...options
    };
    listeners.get("keydown")(event);
    return event;
  };
  app.gameOver = () => {
    app.transport.time = 30;
    app.stamp += 16;
    app.frame(app.stamp);
    assert.equal(app.engine.dead, true);
    assert.equal(elements.get("overlay-title").textContent, "게임 오버");
  };
  if (!loading) {
    await app.start();
    assert.equal(document.activeElement, elements.get("arena"));
  }
  return app;
}

test("game over preserves game focus instead of moving it to the retry button", async () => {
  const app = await application();
  app.gameOver();
  assert.equal(app.document.activeElement, app.get("arena"));
  assert.equal(app.get("overlay").hidden, false);
});

test("results show the finished run and stay hidden when the next run is paused", async () => {
  const app = await application();
  app.engine.score = 12345;
  app.engine.bestCombo = 12;
  Object.assign(app.engine.stats, { perfect: 5, hit: 4, enough: 3, uhoh: 2, poor: 1 });
  app.get("overlay").scrollTop = 120;
  app.gameOver();
  assert.equal(app.get("overlay").scrollTop, 0);
  assert.equal(app.get("run-result").hidden, false);
  assert.equal(app.get("game-instructions").hidden, true);
  assert.equal(app.get("load-status").hidden, true);
  assert.equal(app.get("result-score").textContent, "12,345");
  assert.equal(app.get("result-combo").textContent, "12");
  assert.equal(app.get("result-loop").textContent, "1");
  for (const [kind, count] of Object.entries(app.engine.stats)) {
    assert.equal(app.get("result-" + kind).textContent, count.toLocaleString("ko-KR"));
  }
  await app.start();
  await app.get("pause").listeners.get("click")();
  assert.equal(app.get("overlay-title").textContent, "잠깐 쉬어가기");
  assert.equal(app.get("run-result").hidden, true);
  assert.equal(app.get("game-instructions").hidden, false);
  assert.equal(app.get("load-status").hidden, false);
});

test("arrows and WASD after game over cannot scroll or change the finished run", async () => {
  const app = await application();
  app.gameOver();
  const result = JSON.stringify([app.engine.score, app.engine.stats]);
  for (const key of [
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
    "ArrowUp",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyW"
  ]) {
    for (const repeat of [false, true]) {
      const event = app.key(key, { repeat });
      assert.equal(event.defaultPrevented, true, key);
      assert.equal(event.propagationStopped, true, key);
    }
  }
  assert.equal(JSON.stringify([app.engine.score, app.engine.stats]), result);
});

test("Enter retries from game focus while held Enter does not restart", async () => {
  const app = await application();
  app.gameOver();
  const previous = app.engine;
  app.key("Enter", { repeat: true });
  assert.equal(app.transport.starts, 1);
  app.key("Enter");
  await settle();
  assert.equal(app.transport.starts, 2);
  assert.notEqual(app.engine, previous);
  assert.equal(app.document.activeElement, app.get("arena"));
  assert.equal(app.get("overlay").hidden, true);
});

test("R retries during play, while paused and after game over, but a held R does not repeat", async () => {
  const app = await application();
  app.key("KeyR", { repeat: true });
  await settle();
  assert.equal(app.transport.starts, 1);
  assert.equal(app.key("KeyR").defaultPrevented, true);
  await settle();
  assert.equal(app.transport.starts, 2);
  app.key("Escape");
  await settle();
  app.key("KeyR");
  await settle();
  assert.equal(app.transport.starts, 3);
  app.gameOver();
  const previous = app.engine;
  app.key("KeyR");
  await settle();
  assert.equal(app.transport.starts, 4);
  assert.notEqual(app.engine, previous);
  app.get("offset").focus();
  app.key("KeyR");
  await settle();
  assert.equal(app.transport.starts, 4);
});

test("a custom key layout drives lanes and retry, and keys are ignored while one is being rebound", async () => {
  let capturing = false;
  const custom = { left: "KeyJ", down: "KeyK", up: "KeyI", right: "KeyL", retry: "KeyP" };
  const app = await application({ keyBindings: { get: () => custom, capturing: () => capturing } });
  const note = app.engine.notes[0];
  app.transport.time = note.at;
  const defaults = { left: "KeyA", down: "KeyS", right: "KeyD", up: "KeyW" };
  const keys = { left: "KeyJ", down: "KeyK", right: "KeyL", up: "KeyI" };
  assert.notEqual(app.key(defaults[note.lane]).defaultPrevented, true);
  assert.equal(note.state, "waiting");
  assert.equal(app.key(keys[note.lane]).defaultPrevented, true);
  assert.equal(note.state, "caught");
  app.key("KeyR");
  await settle();
  assert.equal(app.transport.starts, 1);
  capturing = true;
  assert.notEqual(app.key("KeyP").defaultPrevented, true);
  await settle();
  assert.equal(app.transport.starts, 1);
  capturing = false;
  app.key("KeyP");
  await settle();
  assert.equal(app.transport.starts, 2);
});

test("saved practice settings are restored on load and saved again when changed", async () => {
  const app = await application({
    storedSettings: { level: "hard", rate: 2, volume: 30, timingFeedback: false, labels: false }
  });
  assert.equal(app.engine.level, "hard");
  assert.equal(app.engine.scrollSpeed, 2);
  assert.equal(app.get("volume").value, "30");
  assert.equal(app.get("volume-value").textContent, "30%");
  assert.equal(app.get("timing-feedback").checked, false);
  assert.equal(app.get("note-labels").checked, false);
  assert.equal(app.transport.gain.gain.value, 0.3);
  app.get("volume").value = "80";
  app.get("volume").listeners.get("input")();
  app.get("note-labels").checked = true;
  app.get("note-labels").listeners.get("change")();
  assert.deepEqual(readPracticeSettings(app.storage), {
    level: "hard",
    rate: 2,
    volume: 80,
    timingFeedback: false,
    labels: true
  });
});

test("game over does not steal settings focus or block their arrow controls", async () => {
  const app = await application();
  app.get("offset").focus();
  app.gameOver();
  assert.equal(app.document.activeElement, app.get("offset"));
  assert.notEqual(app.key("ArrowRight").defaultPrevented, true);
  app.get("rate").focus();
  assert.notEqual(app.key("ArrowDown").defaultPrevented, true);
});

test("direction input still catches notes and suppresses scrolling during play", async () => {
  const app = await application();
  const note = app.engine.notes[0];
  app.transport.time = note.at;
  const keys = { left: "ArrowLeft", down: "ArrowDown", right: "ArrowRight", up: "ArrowUp" };
  assert.equal(app.key(keys[note.lane]).defaultPrevented, true);
  assert.equal(note.state, "caught");
});

test("sync diagnosis pauses gameplay, isolates its audio and applies an absolute saved offset", async () => {
  const app = await application({ storedOffset: 70 });
  await app.get("sync-open").listeners.get("click")();
  assert.equal(app.sync.isOpen, true);
  assert.equal(app.transport.paused, true);
  await app.get("sync-start").listeners.get("click")();
  assert.equal(app.contexts.length, 2);
  assert.equal(app.contexts[0].state, "running");
  const run = app.sync.run;
  const score = app.engine.score;
  for (let index = 0; index < SYNC_CONFIG.beats; index++) {
    const stamp = app.syncTime((SYNC_CONFIG.warmup + index) * run.interval + 0.042);
    const event = app.key("Space", { timeStamp: stamp });
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(app.engine.score, score);
  assert.equal(run.samples.size, 20);
  const diagnosticContext = app.sync.audio.context;
  app.syncTime(run.endAt + 0.1);
  app.stamp += 16;
  app.frame(app.stamp);
  assert.equal(app.sync.result.reliable, true);
  assert.equal(app.get("sync-recommendation").textContent, "+42ms");
  app.get("sync-apply").listeners.get("click")();
  assert.equal(Number(app.get("offset").value), 42);
  assert.equal(readOffset(app.storage), 42);
  assert.equal(diagnosticContext.state, "closed");
  app.get("sync-close").listeners.get("click")();
  assert.equal(app.transport.paused, true);
  await app.get("sync-open").listeners.get("click")();
  assert.equal(Number(app.get("sync-progress").value), 0);
  assert.equal(app.get("sync-count").textContent, "0 / 20");
  assert.equal(app.get("sync-apply").disabled, true);
  app.get("sync-close").listeners.get("click")();
  await app.start();
  const note = app.engine.notes[0];
  app.transport.time = note.at + 0.042;
  app.key({ left: "ArrowLeft", down: "ArrowDown", right: "ArrowRight", up: "ArrowUp" }[note.lane]);
  assert.equal(note.state, "caught");
  assert.equal(app.engine.stats.perfect, 1);
});

test("cancelling or leaving a sync diagnosis closes its audio and preserves the previous value", async () => {
  const app = await application({ storedOffset: -28 });
  await app.get("sync-open").listeners.get("click")();
  await app.get("sync-start").listeners.get("click")();
  const context = app.sync.audio.context;
  app.hide();
  assert.equal(context.state, "closed");
  assert.equal(app.sync.audio, null);
  assert.equal(app.get("sync-apply").disabled, true);
  assert.equal(Number(app.get("offset").value), -28);
  app.get("sync-close").listeners.get("click")();
  assert.equal(app.sync.isOpen, false);
  assert.equal(app.document.activeElement, app.get("sync-open"));
});

test("sync diagnosis requested during a restart waits for it and then pauses", async () => {
  const app = await application();
  const restarting = app.start();
  await app.get("sync-open").listeners.get("click")();
  await restarting;
  await settle();
  assert.equal(app.sync.isOpen, true);
  assert.equal(app.transport.paused, true);
});

test("silent and incomplete diagnoses cannot apply a recommendation", async () => {
  const app = await application({ storedOffset: 60 });
  await app.get("sync-open").listeners.get("click")();
  app.get("sync-volume").value = "0";
  await app.get("sync-start").listeners.get("click")();
  assert.equal(app.sync.audio, null);
  app.get("sync-volume").value = "50";
  await app.get("sync-start").listeners.get("click")();
  app.syncTime(app.sync.run.endAt + 0.1);
  app.stamp += 16;
  app.frame(app.stamp);
  assert.equal(app.sync.result.reliable, false);
  assert.equal(app.get("sync-apply").disabled, true);
  app.get("sync-apply").listeners.get("click")();
  assert.equal(Number(app.get("offset").value), 60);
});

test("two rapid diagnosis requests open one modal after the pause completes", async () => {
  const app = await application();
  await Promise.all([
    app.get("sync-open").listeners.get("click")(),
    app.get("sync-open").listeners.get("click")()
  ]);
  await settle();
  assert.equal(app.sync.isOpen, true);
  assert.equal(app.transport.paused, true);
});

test("retesting after a completed measurement resets the old frame-gap guard", async () => {
  const app = await application();
  await app.get("sync-open").listeners.get("click")();
  await app.get("sync-start").listeners.get("click")();
  app.syncTime(app.sync.run.endAt + 0.1);
  app.stamp = 16;
  app.frame(app.stamp);
  assert.equal(app.sync.isMeasuring, false);
  await app.get("sync-start").listeners.get("click")();
  app.stamp = 10000;
  app.frame(app.stamp);
  assert.equal(app.sync.isMeasuring, true);
  app.get("sync-close").listeners.get("click")();
});

test("the native player releases music, calibration, animation and all input listeners on unmount", async () => {
  const app = await application();
  assert.equal(app.ready, true);
  await app.sync.open();
  await app.sync.start();
  const calibrationContext = app.sync.audio.context;
  app.dispose();
  assert.equal(app.contexts[0].state, "closed");
  assert.equal(calibrationContext.state, "closed");
  assert.equal(app.sync.isMeasuring, false);
  assert.deepEqual(app.cancelled, [1]);
  assert(app.signals.size > 0);
  assert([...app.signals].every((signal) => signal.aborted));
  app.frame(100);
  await app.start();
  assert.equal(app.transport.starts, 1);
  app.dispose();
  assert.deepEqual(app.cancelled, [1]);
});

test("moving focus to the service pauses the game without losing the run", async () => {
  const app = await application();
  const run = app.engine;
  app.emit("blur");
  await settle();
  assert.equal(app.transport.paused, true);
  assert.equal(app.get("overlay-title").textContent, "잠깐 쉬어가기");
  assert.equal(app.engine, run);
});

test("leaving during a pending restart cannot restart music or request another frame", async () => {
  const app = await application();
  let resolveStart;
  app.transport.start = () =>
    new Promise((resolve) => {
      resolveStart = resolve;
    });
  const restarting = app.get("restart").listeners.get("click")();
  app.dispose();
  resolveStart();
  await restarting;
  assert.equal(app.contexts[0].state, "closed");
  assert.deepEqual(app.cancelled, [1]);
  assert.equal(app.get("overlay").hidden, true);
});

test("service navigation and unrelated inputs are never swallowed by game key handling", async () => {
  const app = await application();
  const outside = { tagName: "BUTTON" };
  app.document.activeElement = outside;
  assert.notEqual(app.key("ArrowLeft").defaultPrevented, true);
  app.focusOut(outside);
  await settle();
  assert.equal(app.transport.paused, true);
  assert.equal(app.document.activeElement, outside);
});

test("unmounting during asset loading cannot create audio or a frame after the request completes", async () => {
  let finish;
  const fetchReady = new Promise((resolve) => {
    finish = resolve;
  });
  const app = await application({ fetchReady, loading: true });
  app.dispose();
  finish();
  await settle();
  assert.equal(app.contexts.length, 0);
  assert.equal(app.ready, false);
  assert.equal(app.frame, null);
  assert(app.requests.every((request) => request.options.signal.aborted));
});

test("unmounting during music decoding closes its context and prevents late initialization", async () => {
  let finish;
  const decodeReady = new Promise((resolve) => {
    finish = resolve;
  });
  const app = await application({ decodeReady, loading: true });
  assert.equal(app.contexts.length, 1);
  app.dispose();
  finish();
  await settle();
  assert.equal(app.contexts[0].state, "closed");
  assert.equal(app.ready, false);
  assert.equal(app.frame, null);
});
