import { useId, useRef } from "react";

import { STICK_CELLS, STICK_LENGTH_CM } from "./puzzle";
import { STICK_WIDTH, STICK_X0, StickArt, toStickX } from "./StickArt";

const NUDGE_CM = 0.025;
const MIN_POSITION = 0.1;
const MAX_POSITION = STICK_LENGTH_CM - 0.1;

export const clampPosition = (position) => Math.min(MAX_POSITION, Math.max(MIN_POSITION, position));

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
        const step = event.shiftKey ? NUDGE_CM * 4 : NUDGE_CM;
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
        <g className="stick-board__knife" transform={`translate(${cutX} 0)`}>
          <line x1="0" x2="0" y1="0" y2="128" />
          <rect height="32" rx="16" width="64" x="-32" y="132" />
          <line className="stick-board__grip" x1="-8" x2="-8" y1="141" y2="155" />
          <line className="stick-board__grip" x1="0" x2="0" y1="141" y2="155" />
          <line className="stick-board__grip" x1="8" x2="8" y1="141" y2="155" />
        </g>
      </svg>
    </div>
  );
}

export { NUDGE_CM };
