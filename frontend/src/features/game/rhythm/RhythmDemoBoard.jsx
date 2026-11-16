import { useEffect, useRef, useState } from "react";

import { mountDemoBoard } from "./mount-demo-board.mjs";
import { RhythmBoardArt } from "./RhythmBoardArt.jsx";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// 첫 화면 카드 그림 자리에서 실제 판이 자동으로 치는 모습을 소리 없이 보여 준다.
// variant="duo"는 온라인 매칭 카드용으로 내 판과 상대 판을 나란히 돌린다.
// 불러오는 동안과 움직임 줄이기 설정, 불러오기 실패 때는 그림(RhythmBoardArt)을 그대로 둔다.
export function RhythmDemoBoard({ variant = "single" }) {
  const canvasReference = useRef(null);
  const rivalReference = useRef(null);
  const [state, setState] = useState(() => (prefersReducedMotion() ? "still" : "loading"));
  const animated = state !== "still";
  const duo = variant === "duo";

  useEffect(() => {
    if (!animated) return undefined;
    return mountDemoBoard({
      canvas: canvasReference.current,
      rivalCanvas: rivalReference.current,
      onReady: () => setState("ready"),
      onError: () => setState("still")
    });
  }, [animated]);

  return (
    <div className={`rhythm-demo${duo ? " rhythm-demo--duo" : ""}${state === "ready" ? " is-ready" : ""}`}>
      {state === "ready" ? null : <RhythmBoardArt variant={variant} />}
      {animated ? (
        <div className="rhythm-demo__boards">
          <canvas className="rhythm-demo__board" height="900" ref={canvasReference} width="900" />
          {duo ? (
            <canvas className="rhythm-demo__board" height="900" ref={rivalReference} width="900" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
