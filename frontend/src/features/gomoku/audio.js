const START_AUDIO_GRACE_MS = 1000;

export function createGomokuAudio(sounds) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const silent = { play() {}, dispose() {} };
  if (!Context) return silent;
  let context;
  try {
    context = new Context({ latencyHint: "interactive" });
  } catch {
    return silent;
  }
  const controller = new AbortController();
  const buffers = new Map();
  const sources = new Set();
  let disposed = false;
  let pendingStartUntil = 0;
  let lastResumeAt = -Infinity;

  function playReady(name) {
    const buffer = buffers.get(name);
    if (disposed || context.state !== "running" || !buffer) return false;
    let source;
    try {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
      };
      source.start();
      sources.add(source);
      return true;
    } catch {
      source?.disconnect();
      return false;
    }
  }

  function flushStart() {
    if (!pendingStartUntil) return;
    if (performance.now() > pendingStartUntil || playReady("start")) pendingStartUntil = 0;
  }

  for (const [name, url] of Object.entries(sounds)) {
    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Sound unavailable");
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        if (disposed) return;
        buffers.set(name, buffer);
        if (name === "start") flushStart();
      })
      .catch(() => {});
  }
  function unlock() {
    if (disposed || !["suspended", "interrupted"].includes(context.state)) return;
    lastResumeAt = performance.now();
    void context.resume().then(flushStart, () => {});
  }
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
  document.addEventListener("click", unlock, true);
  return {
    play(name) {
      if (disposed) return;
      if (name === "start") pendingStartUntil = 0;
      if (playReady(name) || name !== "start") return;

      // Give a confirmed start time to finish decoding or resume from the current gesture.
      const now = performance.now();
      if (context.state === "running" || now - lastResumeAt <= START_AUDIO_GRACE_MS) {
        pendingStartUntil = now + START_AUDIO_GRACE_MS;
      }
    },
    dispose() {
      disposed = true;
      pendingStartUntil = 0;
      controller.abort();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("click", unlock, true);
      for (const source of sources) {
        source.stop();
        source.disconnect();
      }
      sources.clear();
      if (context.state !== "closed") void context.close().catch(() => {});
    }
  };
}
