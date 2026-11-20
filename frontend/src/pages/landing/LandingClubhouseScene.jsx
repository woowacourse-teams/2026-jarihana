import { useEffect, useLayoutEffect, useRef, useState } from "react";

// 영상으로 녹화하던 회전 속도와 비슷하게 1초에 약 4.6도씩 돈다.
const ORBIT_RADIANS_PER_SECOND = 0.08;
// 탭을 다시 열었을 때 카메라가 한 번에 크게 건너뛰지 않도록 프레임 간격을 자른다.
const MAX_FRAME_SECONDS = 0.1;
// 세로로 긴 화면에서는 건물 너비에 맞춘 구도가 너무 멀어 보여 조금 더 가까이 잡는다.
const PORTRAIT_ZOOM_SCALE = 1.8;
// 둘러보기와 3인칭 걷기 사이를 카메라가 날아서 옮겨 가는 시간.
const FLIGHT_MS = 900;
// 3인칭 캐릭터가 현관에서 거실로 걸어 들어가 둘러보는 순서. [머무는 시간(ms), 누르고 있을 걷기 키]
const WALK_SCRIPT = [
  [3200, "KeyW"],
  [900, null],
  [700, "ArrowLeft"],
  [2200, null]
];
// 3인칭으로 넘어간 뒤 첫 걸음을 떼기 전과, 현관으로 돌아온 뒤 다시 걷기 전에 머무는 시간.
const WALK_START_DELAY_MS = 1400;
const WALK_RESTART_DELAY_MS = 1000;
const SIGN_NAME = "주말 아지트";
const NOOP = () => {};

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function sceneZoom(host, defaultZoom) {
  const { width, height } = host.getBoundingClientRect();
  return width && height && width / height < 0.8 ? defaultZoom * PORTRAIT_ZOOM_SCALE : defaultZoom;
}

function loadClubhouseRuntime() {
  return Promise.all([
    import("../space/roomScene"),
    import("../space/roomState"),
    import("../space/roomCameraZoom")
  ]);
}

// 걷기는 아지트 화면이 키보드로 받는 입력을 그대로 쓴다. 장면은 포인터를 받지 않고 포커스도 받지 않아
// 방문자가 직접 조작할 수는 없다.
function sendKey(host, type, code) {
  host.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, code, key: code }));
}

// 실제 아지트 3D 장면(기본 아지트)을 첫 화면 배경으로 그린다. mode가 "orbit"이면 카메라가 아지트를 천천히 돌고,
// "walk"이면 3인칭 캐릭터가 현관을 지나 거실로 걸어 들어가 둘러보기를 되풀이한다.
// 화면에 들어오면 three.js 장면을 불러오고, 준비되기 전이나 그래픽 가속을 쓸 수 없을 때는 녹화 장면 이미지를 보여 준다.
// 화면 밖에서는 멈추고, 동작 줄이기 설정에서는 돌거나 걷지 않고 시점만 바꾼다.
export function LandingClubhouseScene({ label, mode = "orbit", poster }) {
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const sceneRef = useRef(null);
  const modeRef = useRef(mode);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("idle");

  // 시점을 바꾸는 effect보다 먼저 맞춰 두어, 장면이 바뀐 시점의 입력 허용 여부를 읽게 한다.
  useLayoutEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setStarted(true);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    let cancelled = false;
    let runtime;
    let resizeObserver;
    loadClubhouseRuntime()
      .then(([{ createRoomScene }, { createInitialRoom }, { DEFAULT_ROOM_ZOOM }]) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        runtime = createRoomScene(host, {
          // 걷기에서만 키 입력을 받는다. 포인터는 CSS로 막아 끌기와 휠은 페이지 스크롤로 간다.
          canInteract: () => modeRef.current === "walk",
          canEdit: () => false,
          // 꾸미기 화면처럼 섬 전체가 아니라 건물에 맞춰 카메라를 잡는다.
          focusBuilding: () => true,
          getSignName: () => SIGN_NAME,
          isPlayMode: () => false,
          onError: () => {
            if (!cancelled) setStatus("error");
          },
          onInvalid: NOOP,
          onMove: NOOP,
          onSelect: NOOP,
          onWalkInteraction: NOOP,
          onWalkPointerLock: NOOP,
          preserveWalkPose: () => false,
          showPreviewExterior: () => true
        });
        const scene = { room: createInitialRoom(), zoom: sceneZoom(host, DEFAULT_ROOM_ZOOM), view: null, flight: null };
        sceneRef.current = scene;
        runtimeRef.current = runtime;
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            const next = sceneZoom(host, DEFAULT_ROOM_ZOOM);
            if (next === scene.zoom) return;
            scene.zoom = next;
            if (scene.view) runtime.update(scene.room, null, scene.view, scene.zoom, "all", 0, scene.flight ?? undefined);
          });
          resizeObserver.observe(host);
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      runtime?.dispose();
      runtimeRef.current = null;
      sceneRef.current = null;
    };
  }, [started]);

  // 둘러보기와 3인칭 걷기 사이를 오간다. 처음 그릴 때와 동작 줄이기 설정에서는 날지 않고 바로 바꾼다.
  useEffect(() => {
    const runtime = runtimeRef.current;
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (status !== "ready" || !runtime || !scene || !host) return;
    const view = mode === "walk" ? "thirdPerson" : "perspective";
    if (scene.view === view) return;
    const rect = host.getBoundingClientRect();
    const fly = scene.view !== null && !reducedMotion && rect.width > 0 && rect.height > 0;
    scene.view = view;
    if (!fly) {
      scene.flight = null;
      runtime.update(scene.room, null, view, scene.zoom, "all", 0);
      return;
    }
    const flight = {
      duration: FLIGHT_MS,
      from: rect,
      getTargetRect: () => host.getBoundingClientRect(),
      finish: () => {
        window.setTimeout(() => {
          if (sceneRef.current !== scene || scene.flight !== flight) return;
          scene.flight = null;
          runtime.update(scene.room, null, scene.view, scene.zoom, "all", 0);
        }, 0);
      }
    };
    scene.flight = flight;
    runtime.update(scene.room, null, view, scene.zoom, "all", 0, flight);
  }, [mode, reducedMotion, status]);

  useEffect(() => {
    if (status !== "ready" || !visible || reducedMotion || mode !== "orbit") return undefined;
    let frame;
    let previous;
    function step(time) {
      if (previous !== undefined && !document.hidden) {
        const seconds = Math.min((time - previous) / 1000, MAX_FRAME_SECONDS);
        runtimeRef.current?.orbitBy?.(-seconds * ORBIT_RADIANS_PER_SECOND);
      }
      previous = time;
      frame = window.requestAnimationFrame(step);
    }
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [mode, reducedMotion, status, visible]);

  useEffect(() => {
    const host = hostRef.current;
    if (status !== "ready" || !visible || reducedMotion || mode !== "walk" || !host) return undefined;
    let timer;
    let held = null;
    function hold(code) {
      if (held) sendKey(host, "keyup", held);
      held = code;
      if (code) sendKey(host, "keydown", code);
    }
    function play(index) {
      if (index === WALK_SCRIPT.length) {
        hold(null);
        runtimeRef.current?.command?.("reset");
        timer = window.setTimeout(() => play(0), WALK_RESTART_DELAY_MS);
        return;
      }
      const [duration, code] = WALK_SCRIPT[index];
      hold(code);
      timer = window.setTimeout(() => play(index + 1), duration);
    }
    timer = window.setTimeout(() => play(0), WALK_START_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      hold(null);
      runtimeRef.current?.command?.("reset");
    };
  }, [mode, reducedMotion, status, visible]);

  return (
    <div aria-label={label} className="landing-clubhouse-scene" data-scene-mode={mode} data-scene-status={status} role={label ? "img" : undefined}>
      {poster && <img alt="" className="landing-clubhouse-scene__poster" decoding="async" src={poster} />}
      <div aria-hidden="true" className="landing-clubhouse-scene__canvas" ref={hostRef} />
    </div>
  );
}
