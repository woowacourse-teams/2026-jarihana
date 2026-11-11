import { useId, useRef } from "react";

import { KNIFE_STEP_CM, KNIFE_STEPS_PER_CM, STICK_CELLS, STICK_LENGTH_CM, snapToKnifeStep } from "./puzzle";
import { STICK_WIDTH, STICK_X0, StickArt, toStickX } from "./StickArt";

const NUDGE_CM = KNIFE_STEP_CM;
const COARSE_NUDGE_STEPS = 12;
const MIN_POSITION = Math.ceil(0.1 * KNIFE_STEPS_PER_CM) / KNIFE_STEPS_PER_CM;
const MAX_POSITION = Math.floor((STICK_LENGTH_CM - 0.1) * KNIFE_STEPS_PER_CM) / KNIFE_STEPS_PER_CM;

// 칼 위치를 막대 안쪽의 칼 격자로 맞춘다.
export const clampPosition = (position) =>
  Math.min(MAX_POSITION, Math.max(MIN_POSITION, snapToKnifeStep(position)));

function Ruler() {
  return (
    <g className="stick-board__ruler">
      <line x1={STICK_X0} x2={STICK_X0 + STICK_WIDTH} y1="1" y2="1" />
      {Array.from({ length: STICK_CELLS + 1 }, (_, index) => {
        if (index === STICK_CELLS / 2) return null;
        const x = toStickX(index / 2);
        return <line key={index} x1={x} x2={x} y1="1" y2={index % 2 ? 8 : 14} />;
      })}
      <line
        className="stick-board__ruler-middle"
        x1={toStickX(STICK_LENGTH_CM / 2)}
        x2={toStickX(STICK_LENGTH_CM / 2)}
        y1="1"
        y2="18"
      />
    </g>
  );
}

function RulerLabels() {
  return (
    <div aria-hidden="true" className="stick-board__labels">
      {Array.from({ length: STICK_LENGTH_CM + 1 }, (_, centimeter) => {
        const middle = centimeter === STICK_LENGTH_CM / 2;
        return (
          <span
            className={[
              middle ? "stick-board__label--middle" : "",
              centimeter % 2 ? "stick-board__label--odd" : ""
            ].join(" ").trim()}
            key={centimeter}
            style={{ left: `${(toStickX(centimeter) / 1000) * 100}%` }}
          >
            {centimeter === STICK_LENGTH_CM ? `${STICK_LENGTH_CM}cm` : centimeter}
          </span>
        );
      })}
    </div>
  );
}

// 막대와 칼선이다. 칼 위치 숫자는 보여 주지 않고, 눈금을 보고 맞추게 한다.
export function StickBoard({
  answerPosition = null,
  locked = false,
  onActivity,
  onPositionChange,
  onSubmit,
  position,
  stick
}) {
  const svgReference = useRef(null);
  const draggingReference = useRef(false);
  const clipId = useId().replace(/:/g, "");
  const cutX = toStickX(position);

  function positionFromEvent(event) {
    const rect = svgReference.current.getBoundingClientRect();
    const viewBoxX = ((event.clientX - rect.left) / rect.width) * 1000;
    return clampPosition((viewBoxX - STICK_X0) / (STICK_WIDTH / STICK_LENGTH_CM));
  }

  function move(next) {
    onPositionChange(clampPosition(next));
    onActivity?.();
  }

  return (
    <div
      aria-disabled={locked || undefined}
      aria-label="칼 위치, 막대 왼쪽 끝부터 cm"
      aria-valuemax={STICK_LENGTH_CM}
      aria-valuemin={0}
      aria-valuenow={Number(position.toFixed(1))}
      aria-valuetext={`왼쪽 끝에서 약 ${position.toFixed(1)}cm`}
      className={`stick-board${locked ? " stick-board--locked" : ""}`}
      data-ph-capture-attribute-action="stick_knife_move"
      onKeyDown={(event) => {
        if (locked) return;
        const step = event.shiftKey ? NUDGE_CM * COARSE_NUDGE_STEPS : NUDGE_CM;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          move(position - step);
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          move(position + step);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSubmit?.();
        }
      }}
      onPointerCancel={() => {
        draggingReference.current = false;
      }}
      onPointerDown={(event) => {
        if (locked) return;
        draggingReference.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        move(positionFromEvent(event));
      }}
      onPointerMove={(event) => {
        if (locked || !draggingReference.current) return;
        move(positionFromEvent(event));
      }}
      onPointerUp={() => {
        draggingReference.current = false;
      }}
      role="slider"
      tabIndex={locked ? -1 : 0}
    >
      <RulerLabels />
      <svg aria-hidden="true" ref={svgReference} viewBox="0 0 1000 170">
        <defs>
          <clipPath id={`${clipId}-left`}>
            <rect height="170" width={cutX} x="0" y="0" />
          </clipPath>
          <clipPath id={`${clipId}-right`}>
            <rect height="170" width={1000 - cutX} x={cutX} y="0" />
          </clipPath>
        </defs>
        <Ruler />
        {answerPosition === null ? (
          <StickArt stick={stick} />
        ) : (
          <g className="stick-board__pieces">
            <g className="stick-board__piece stick-board__piece--left" clipPath={`url(#${clipId}-left)`}>
              <StickArt stick={stick} />
            </g>
            <g className="stick-board__piece stick-board__piece--right" clipPath={`url(#${clipId}-right)`}>
              <StickArt stick={stick} />
            </g>
          </g>
        )}
        {answerPosition === null ? null : (
          <line
            className="stick-board__answer"
            x1={toStickX(answerPosition)}
            x2={toStickX(answerPosition)}
            y1="0"
            y2="122"
          />
        )}
        <Knife x={cutX} />
      </svg>
    </div>
  );
}

// 막대를 자르는 칼이다. 손잡이를 아래에 두고 얇은 칼날을 세워, 칼날 가운데(x)가 자르는 자리에 오게 그린다.
export function Knife({ x }) {
  const steelId = `${useId().replace(/:/g, "")}-steel`;
  return (
    <g className="stick-board__knife" transform={`translate(${x} 0)`}>
      <defs>
        <linearGradient id={steelId} x1="0" x2="1" y1="0" y2="0">
          <stop className="stick-knife__steel-light" offset="0" />
          <stop className="stick-knife__steel-dark" offset="1" />
        </linearGradient>
      </defs>
      <path className="stick-knife__blade" d="M-2.5 124 V13 L0 2 L2.5 13 V124 Z" fill={`url(#${steelId})`} />
      <rect className="stick-knife__bolster" height="7" rx="2" width="16" x="-8" y="122" />
      <rect className="stick-knife__handle" height="38" rx="8" width="22" x="-11" y="128" />
      <circle className="stick-knife__rivet" cx="0" cy="139" r="2.4" />
      <circle className="stick-knife__rivet" cx="0" cy="155" r="2.4" />
    </g>
  );
}

export { COARSE_NUDGE_STEPS, NUDGE_CM };
