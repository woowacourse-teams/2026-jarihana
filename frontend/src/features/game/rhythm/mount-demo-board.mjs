import { GameEngine } from "./engine.mjs";
import { NOTE_SYLLABLES } from "./lesson.mjs";
import { Renderer } from "./render.mjs";
import { SPRITE_ATLAS } from "./sprite-atlas.mjs";
import { STAGES } from "./stages.mjs";

// 첫 화면 카드에서 실제 엔진과 렌더러로 판을 소리 없이 자동 재생한다. 입력, 점수 기록, 오디오는 없다.
// 첫 루프의 앞부분만 보여 주고 처음부터 다시 돌려 곡 가속, 하트 충전 표시가 나오지 않게 한다.
const DEMO_LEVEL = "medium";
const DEMO_SECONDS = 30;

export function mountDemoBoard({ canvas, onReady, onError }) {
  const lifetime = new AbortController();
  let disposed = false;
  let frame = null;
  let renderer = null;
  let chart = null;
  let engine = null;
  let origin = 0;
  let onScreen = true;

  // 첫 박(카운트다운이 끝난 때)에서 시작해 이미 다가오는 세균부터 보여 준다.
  function restart(now) {
    engine = new GameEngine(chart, { level: DEMO_LEVEL, scrollSpeed: 1, autoplay: true });
    renderer.effects = [];
    renderer.lastHit = null;
    renderer.hurtUntil = -1;
    origin = now - engine.loops[0].start * 1000;
  }

  function step(now) {
    if (disposed) return;
    if ((now - origin) / 1000 - engine.loops[0].start > DEMO_SECONDS) restart(now);
    const time = (now - origin) / 1000;
    engine.tick(time);
    renderer.receive(engine.drainEffects());
    renderer.draw(time, engine);
    frame = requestAnimationFrame(step);
  }

  // 화면 밖이거나 탭이 숨으면 멈추고, 다시 보이면 처음부터 돌린다.
  function play() {
    if (disposed || !renderer || frame !== null || !onScreen || document.hidden) return;
    restart(performance.now());
    frame = requestAnimationFrame(step);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting);
          if (onScreen) play();
          else stop();
        })
      : null;
  observer?.observe(canvas);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) stop();
      else play();
    },
    { signal: lifetime.signal }
  );

  const sprites = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("스프라이트를 불러올 수 없어요."));
    image.src = SPRITE_ATLAS.url;
  });
  Promise.all([
    fetch(STAGES.original.chart, { signal: lifetime.signal }).then((response) => {
      if (!response.ok) throw new Error("채보를 불러올 수 없어요.");
      return response.json();
    }),
    sprites
  ])
    .then(([loadedChart, image]) => {
      if (disposed) return;
      chart = loadedChart;
      renderer = new Renderer(canvas, image);
      renderer.labels = NOTE_SYLLABLES;
      onReady?.();
      play();
    })
    .catch((error) => {
      if (!disposed) onError?.(error);
    });

  return () => {
    disposed = true;
    stop();
    lifetime.abort();
    observer?.disconnect();
    renderer?.resize?.disconnect();
  };
}
