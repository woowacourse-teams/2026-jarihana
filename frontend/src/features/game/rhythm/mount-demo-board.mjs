import { RIVAL_SEED, driveRival, seededRandom } from "./demo-rival.mjs";
import { GameEngine } from "./engine.mjs";
import { NOTE_SYLLABLES } from "./lesson.mjs";
import { Renderer } from "./render.mjs";
import { SPRITE_ATLAS } from "./sprite-atlas.mjs";
import { STAGES } from "./stages.mjs";

// 첫 화면 카드에서 실제 엔진과 렌더러로 판을 소리 없이 자동 재생한다. 입력, 점수 기록, 오디오는 없다.
// 첫 루프의 앞부분만 보여 주고 처음부터 다시 돌려 곡 가속, 하트 충전 표시가 나오지 않게 한다.
// rivalCanvas를 주면 같은 곡을 같은 시각에 치는 상대 판을 옆에 그린다(온라인 매칭 카드).
// 내 판은 모두 맞추고, 상대 판은 사나운 얼굴로 가끔 어긋나거나 놓친다(demo-rival.mjs).
const DEMO_LEVEL = "medium";
const DEMO_SECONDS = 30;
const FIERCE_FACE = 1;

export function mountDemoBoard({ canvas, rivalCanvas = null, onReady, onError }) {
  const lifetime = new AbortController();
  const canvases = rivalCanvas ? [canvas, rivalCanvas] : [canvas];
  const visible = new Set(canvases);
  let disposed = false;
  let frame = null;
  let chart = null;
  let players = [];
  let origin = 0;

  // 첫 박(카운트다운이 끝난 때)에서 시작해 이미 다가오는 세균부터 보여 준다.
  function restart(now) {
    for (const player of players) {
      player.engine = new GameEngine(chart, {
        level: DEMO_LEVEL,
        scrollSpeed: 1,
        autoplay: !player.rival
      });
      player.plans = new Map();
      player.random = seededRandom(RIVAL_SEED);
      player.renderer.effects = [];
      player.renderer.lastHit = null;
      player.renderer.hurtUntil = -1;
    }
    origin = now - players[0].engine.loops[0].start * 1000;
  }

  function step(now) {
    if (disposed) return;
    const start = players[0].engine.loops[0].start;
    if ((now - origin) / 1000 - start > DEMO_SECONDS) restart(now);
    const time = (now - origin) / 1000;
    for (const { engine, renderer, rival, plans, random } of players) {
      if (rival) driveRival(engine, time, plans, random);
      else engine.tick(time);
      renderer.receive(engine.drainEffects());
      renderer.draw(time, engine);
    }
    frame = requestAnimationFrame(step);
  }

  // 판이 모두 화면 밖이거나 탭이 숨으면 멈추고, 다시 보이면 처음부터 돌린다.
  function play() {
    if (disposed || !players.length || frame !== null || !visible.size || document.hidden) return;
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
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
          }
          if (visible.size) play();
          else stop();
        })
      : null;
  for (const target of canvases) observer?.observe(target);
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
      players = canvases.map((target) => {
        const renderer = new Renderer(target, image);
        const rival = target === rivalCanvas;
        // 판 두 개를 나란히 둘 때는 판이 작아 세균 위 글자를 읽을 수 없으므로 뺀다.
        renderer.labels = rivalCanvas ? null : NOTE_SYLLABLES;
        renderer.showTiming = false;
        if (rival) renderer.restingExpression = FIERCE_FACE;
        return { renderer, rival, engine: null, plans: null, random: null };
      });
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
    for (const { renderer } of players) renderer.resize?.disconnect();
  };
}
