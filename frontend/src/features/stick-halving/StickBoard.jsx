import { useId, useRef } from "react";

import { KNIFE_STEP_CM, KNIFE_STEPS_PER_CM, STICK_CELLS, STICK_LENGTH_CM, snapToKnifeStep } from "./puzzle";
import { STICK_CY, STICK_HALF, STICK_WIDTH, STICK_X0, StickArt, toStickX } from "./StickArt";

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

const LOUPE_HALF_CM = 1;
const LOUPE_TOP = STICK_CY - 2 * STICK_HALF;
const LOUPE_HEIGHT = 4 * STICK_HALF;

// 칼 주변 2cm를 가로로 크게 늘려 보여 주는 확대 창이다. 눈금 한 칸이 칼이 움직이는 가장 작은 칸이고,
// 여기서 끌면 본 막대보다 훨씬 천천히 움직여 칸을 세며 맞출 수 있다.
export function KnifeLoupe({ answerPosition = null, locked = false, onPositionChange, position, stick }) {
  const dragReference = useRef(null);
  const from = position - LOUPE_HALF_CM;
  const to = position + LOUPE_HALF_CM;
  const x = toStickX(from);
  const width = toStickX(to) - x;
  const ticks = [];
  for (let step = Math.ceil(from * KNIFE_STEPS_PER_CM); step <= Math.floor(to * KNIFE_STEPS_PER_CM); step += 1) {
    if (step < 0 || step > STICK_LENGTH_CM * KNIFE_STEPS_PER_CM) continue;
    const cell = step % (KNIFE_STEPS_PER_CM / 2) === 0;
    const eighth = step % (KNIFE_STEPS_PER_CM / 8) === 0;
    ticks.push({ cell, centimeter: step / KNIFE_STEPS_PER_CM, length: cell ? 1 : eighth ? 0.6 : 0.3, step });
  }
  const percent = (centimeter) => `${((toStickX(centimeter) - x) / width) * 100}%`;

  return (
    <div
      aria-hidden="true"
      className={`stick-loupe${locked ? " stick-loupe--locked" : ""}`}
      data-ph-capture-attribute-action="stick_knife_fine_move"
      onPointerCancel={() => {
        dragReference.current = null;
      }}
      onPointerDown={(event) => {
        if (locked) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        dragReference.current = { position, startX: event.clientX, width: rect.width };
      }}
      onPointerMove={(event) => {
        const drag = dragReference.current;
        if (locked || !drag) return;
        const moved = ((event.clientX - drag.startX) / drag.width) * (2 * LOUPE_HALF_CM);
        onPositionChange(clampPosition(drag.position + moved));
      }}
      onPointerUp={() => {
        dragReference.current = null;
      }}
    >
      <div className="stick-loupe__labels">
        {ticks.filter((tick) => tick.cell).map((tick) => (
          <span key={tick.step} style={{ left: percent(tick.centimeter) }}>{tick.centimeter.toFixed(1)}</span>
        ))}
      </div>
      <svg className="stick-loupe__ticks" preserveAspectRatio="none" viewBox={`${x} 0 ${width} 10`}>
        {ticks.map((tick) => (
          <line
            className={tick.cell ? "stick-loupe__tick--cell" : undefined}
            key={tick.step}
            vectorEffect="non-scaling-stroke"
            x1={toStickX(tick.centimeter)}
            x2={toStickX(tick.centimeter)}
            y1={10 - tick.length * 10}
            y2="10"
          />
        ))}
      </svg>
      <svg className="stick-loupe__stick" preserveAspectRatio="none" viewBox={`${x} ${LOUPE_TOP} ${width} ${LOUPE_HEIGHT}`}>
        <StickArt stick={stick} />
        {answerPosition === null ? null : (
          <line
            className="stick-loupe__answer"
            vectorEffect="non-scaling-stroke"
            x1={toStickX(answerPosition)}
            x2={toStickX(answerPosition)}
            y1={LOUPE_TOP}
            y2={LOUPE_TOP + LOUPE_HEIGHT}
          />
        )}
        <line
          className="stick-loupe__knife"
          vectorEffect="non-scaling-stroke"
          x1={toStickX(position)}
          x2={toStickX(position)}
          y1={LOUPE_TOP}
          y2={LOUPE_TOP + LOUPE_HEIGHT}
        />
      </svg>
    </div>
  );
}

export { NUDGE_CM };
