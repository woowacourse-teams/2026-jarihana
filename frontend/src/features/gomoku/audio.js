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
  for (const [name, url] of Object.entries(sounds)) {
    void fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Sound unavailable");
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        if (!disposed) buffers.set(name, buffer);
      })
      .catch(() => {});
  }
  function unlock() {
    if (!disposed && context.state === "suspended") void context.resume().catch(() => {});
  }
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
  return {
    play(name) {
      // Do not queue missed cues: a later gesture must not replay an old game event.
      if (disposed || context.state !== "running" || !buffers.has(name)) return;
      let source;
      try {
        source = context.createBufferSource();
        source.buffer = buffers.get(name);
        source.connect(context.destination);
        source.onended = () => {
          sources.delete(source);
          source.disconnect();
        };
        source.start();
        sources.add(source);
      } catch {
        source?.disconnect();
        // Audio availability must never affect game commands or the board.
      }
    },
    dispose() {
      disposed = true;
      controller.abort();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      for (const source of sources) {
        source.stop();
        source.disconnect();
      }
      sources.clear();
      if (context.state !== "closed") void context.close().catch(() => {});
    }
  };
}
