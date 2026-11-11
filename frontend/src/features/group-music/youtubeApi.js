let pending;

export function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement("script");
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener("error", failed);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
    };
    const failed = () => {
      cleanup();
      if (!existing) script.remove();
      reject(new Error("유튜브 플레이어를 불러오지 못했어요. 다시 시도해 주세요."));
    };
    const ready = () => {
      cleanup();
      try { previous?.(); } finally {
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error("유튜브 플레이어가 준비되지 않았어요."));
      }
    };
    window.onYouTubeIframeAPIReady = ready;
    script.addEventListener("error", failed, { once: true });
    timer = setTimeout(failed, 15000);
    if (!existing) { script.src = "https://www.youtube.com/iframe_api"; script.async = true; document.head.append(script); }
  }).catch((error) => { pending = undefined; throw error; });
  return pending;
}
