import { useEffect, useRef, useState } from "react";

import { mountDemoBoard } from "./mount-demo-board.mjs";
import { RhythmBoardArt } from "./RhythmBoardArt.jsx";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// 첫 화면 카드 그림 자리에서 실제 판이 자동으로 치는 모습을 소리 없이 보여 준다.
// 불러오는 동안과 움직임 줄이기 설정, 불러오기 실패 때는 그림(RhythmBoardArt)을 그대로 둔다.
export function RhythmDemoBoard() {
  const canvasReference = useRef(null);
  const [state, setState] = useState(() => (prefersReducedMotion() ? "still" : "loading"));
  const animated = state !== "still";

  useEffect(() => {
    if (!animated) return undefined;
    return mountDemoBoard({
      canvas: canvasReference.current,
      onReady: () => setState("ready"),
      onError: () => setState("still")
    });
  }, [animated]);

  return (
    <div className={`rhythm-demo${state === "ready" ? " is-ready" : ""}`}>
      {state === "ready" ? null : <RhythmBoardArt />}
      {animated ? (
        <canvas className="rhythm-demo__board" height="900" ref={canvasReference} width="900" />
      ) : null}
    </div>
  );
}
