import { useId } from "react";

import { CELL_CM, STICK_CELLS, STICK_LENGTH_CM, almondPosition } from "./puzzle";

// 막대 그림의 좌표계(viewBox 1000 x 170). 옆에서 본 넓이가 무게에 비례하도록
// 얇은 초코는 막대 높이의 1.5배, 두꺼운 초코는 2배로 그린다.
export const STICK_X0 = 24;
export const STICK_WIDTH = 952;
export const STICK_CY = 66;
export const STICK_HALF = 22;
export const STICK_BOTTOM = STICK_CY + 2 * STICK_HALF;
const COAT = { NONE: 0, THICK: STICK_HALF, THIN: STICK_HALF / 2 };
const UNITS_PER_CM = STICK_WIDTH / STICK_LENGTH_CM;

export const toStickX = (positionCm) => STICK_X0 + positionCm * UNITS_PER_CM;

function runsOf(cells) {
  const runs = [];
  let start = 0;
  for (let index = 1; index <= STICK_CELLS; index += 1) {
    if (index === STICK_CELLS || cells[index] !== cells[start]) {
      runs.push({ end: index, level: cells[start], start });
      start = index;
    }
  }
  return runs.filter((run) => run.level !== "NONE");
}

function almondRotation(cell) {
  return ((cell * 37) % 70) - 35;
}

export function StickArt({ stick }) {
  const id = useId().replace(/:/g, "");
  const gradientId = `${id}-biscuit`;
  const clipId = `${id}-coat`;
  const cellWidth = CELL_CM * UNITS_PER_CM;

  return (
    <g className="stick-art">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop className="stick-art__biscuit-top" offset="0" />
          <stop className="stick-art__biscuit-bottom" offset="1" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect
            height={4 * STICK_HALF + 2}
            rx={2 * STICK_HALF + 1}
            width={STICK_WIDTH}
            x={STICK_X0}
            y={STICK_CY - 2 * STICK_HALF - 1}
          />
        </clipPath>
      </defs>
      <rect
        className="stick-art__biscuit"
        fill={`url(#${gradientId})`}
        height={STICK_HALF * 2}
        rx={STICK_HALF}
        width={STICK_WIDTH}
        x={STICK_X0}
        y={STICK_CY - STICK_HALF}
      />
      <g clipPath={`url(#${clipId})`}>
        {runsOf(stick.cells).map((run) => {
          const coat = COAT[run.level];
          const x = STICK_X0 + run.start * cellWidth;
          const width = (run.end - run.start) * cellWidth;
          return (
            <g key={`${run.start}-${run.level}`}>
              <rect
                className={run.level === "THICK" ? "stick-art__choco-thick" : "stick-art__choco-thin"}
                height={2 * (STICK_HALF + coat)}
                width={width + 0.3}
                x={x}
                y={STICK_CY - STICK_HALF - coat}
              />
              <line
                className="stick-art__choco-highlight"
                x1={x + 6}
                x2={x + width - 6}
                y1={STICK_CY - STICK_HALF - coat + 6}
                y2={STICK_CY - STICK_HALF - coat + 6}
              />
            </g>
          );
        })}
        {stick.almonds.map((almond) => {
          const radiusX = almond.size === "LARGE" ? 26 : 18;
          const radiusY = radiusX * 0.62;
          return (
            <g
              key={almond.cell}
              transform={`translate(${toStickX(almondPosition(almond))} ${STICK_CY}) rotate(${almondRotation(almond.cell)})`}
            >
              <ellipse className="stick-art__almond" rx={radiusX} ry={radiusY} />
              <path
                className="stick-art__almond-line"
                d={`M${-radiusX * 0.55} 0 Q0 ${-radiusY * 0.5} ${radiusX * 0.55} 0`}
              />
            </g>
          );
        })}
      </g>
    </g>
  );
}
