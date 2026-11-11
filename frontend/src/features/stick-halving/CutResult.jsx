import { useEffect, useId, useState } from "react";

import { leftMilligrams } from "./puzzle";
import { STICK_BOTTOM, STICK_WIDTH, STICK_X0, StickArt, toStickX } from "./StickArt";

const PIVOT_X = 500;
const PIVOT_Y = 96;
const BEAM_HALF = 300;
const PAN_DROP = 120;
const PIECE_SCALE = 0.34;
const MAX_TILT_DEGREES = 15;

export const formatPercent = (rate) => `${(rate * 100 < 1 ? (rate * 100).toFixed(2) : (rate * 100).toFixed(1))}%`;
export const formatCm = (position) => `${position.toFixed(2)}cm`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// 저울이 기우는 모습을 흔들리다 멈추게 그린다. 움직임 줄이기 설정에서는 바로 기운 상태를 보여 준다.
function useTilt(target) {
  const still = prefersReducedMotion() || typeof requestAnimationFrame !== "function";
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    if (still) return undefined;
    let frame = 0;
    const startedAt = performance.now();
    const step = (time) => {
      const seconds = (time - startedAt) / 1000;
      if (seconds > 2.2) {
        setAngle(target);
        return;
      }
      setAngle(target * (1 - Math.exp(-3 * seconds) * Math.cos(7 * seconds)));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [still, target]);
  return still ? target : angle;
}

function Balance({ position, stick, tiltDegrees }) {
  const id = useId().replace(/:/g, "");
  const angle = (useTilt(tiltDegrees) * Math.PI) / 180;
  const cutX = toStickX(position);
  const leftEnd = { x: PIVOT_X - BEAM_HALF * Math.cos(angle), y: PIVOT_Y - BEAM_HALF * Math.sin(angle) };
  const rightEnd = { x: PIVOT_X + BEAM_HALF * Math.cos(angle), y: PIVOT_Y + BEAM_HALF * Math.sin(angle) };
  const pans = [
    { clip: `${id}-left`, end: leftEnd, middle: (STICK_X0 + cutX) / 2, side: "left" },
    { clip: `${id}-right`, end: rightEnd, middle: (cutX + STICK_X0 + STICK_WIDTH) / 2, side: "right" }
  ];

  return (
    <svg aria-hidden="true" className="cut-result__balance" viewBox="0 0 1000 320">
      <defs>
        <clipPath id={`${id}-left`}>
          <rect height="170" width={cutX} x="0" y="0" />
        </clipPath>
        <clipPath id={`${id}-right`}>
          <rect height="170" width={1000 - cutX} x={cutX} y="0" />
        </clipPath>
      </defs>
      <line className="cut-result__post" x1={PIVOT_X} x2={PIVOT_X} y1={PIVOT_Y} y2="302" />
      <rect className="cut-result__base" height="14" rx="7" width="140" x="430" y="298" />
      {pans.map(({ clip, end, middle, side }) => {
        const panY = end.y + PAN_DROP;
        return (
          <g key={side}>
            <line className="cut-result__string" x1={end.x} x2={end.x - 110} y1={end.y} y2={panY} />
            <line className="cut-result__string" x1={end.x} x2={end.x + 110} y1={end.y} y2={panY} />
            <g transform={`translate(${end.x} ${panY})`}>
              <g transform={`scale(${PIECE_SCALE}) translate(${-middle} ${-STICK_BOTTOM})`}>
                <g clipPath={`url(#${clip})`}>
                  <StickArt stick={stick} />
                </g>
              </g>
              <path className="cut-result__pan" d="M-120 0 L120 0 L100 14 L-100 14 Z" />
            </g>
          </g>
        );
      })}
      <line className="cut-result__beam" x1={leftEnd.x} x2={rightEnd.x} y1={leftEnd.y} y2={rightEnd.y} />
      <circle className="cut-result__pivot" cx={PIVOT_X} cy={PIVOT_Y} r="11" />
    </svg>
  );
}

// 자른 뒤의 결과다. 저울 기울기와 오차로 얼마나 공평했는지 보여 준다. 무게 숫자는 보여 주지 않는다.
export function CutResult({ position, result, stick }) {
  const total = stick.totalMilligrams;
  const left = leftMilligrams(stick, position);
  const right = total - left;
  const tilt = Math.max(-MAX_TILT_DEGREES, Math.min(MAX_TILT_DEGREES, ((right - left) / total) * 150));

  return (
    <div className="cut-result">
      <div className="cut-result__legend">
        <span><i className="cut-result__swatch" />내가 자른 곳 <b>{formatCm(position)}</b></span>
        <span><i className="cut-result__swatch cut-result__swatch--answer" />정답 <b>{formatCm(result.answerPosition)}</b></span>
      </div>
      <Balance position={position} stick={stick} tiltDegrees={tilt} />
      <p className="cut-result__error"><span>오차</span><strong>{formatPercent(result.errorRate)}</strong></p>
    </div>
  );
}
