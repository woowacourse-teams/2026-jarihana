import { useId } from "react";

import { answerPosition, generatePracticeStick } from "./puzzle";
import { StickArt, toStickX } from "./StickArt";
import { Knife } from "./StickBoard";
import "./stick-halving.css";

// 게임방 카드에 쓰는 장식 그림이다. 아몬드가 붙은 막대 하나와, 정답 자리에 선 칼을 그린다.
const SAMPLE_STICK = generatePracticeStick(20261111, 4);
const KNIFE_X = toStickX(answerPosition(SAMPLE_STICK));

export function StickHalvingArtwork() {
  return (
    <svg aria-hidden="true" className="stick-artwork" viewBox="-80 -300 1160 773">
      <StickArt stick={SAMPLE_STICK} />
      <Knife x={KNIFE_X} />
    </svg>
  );
}

// 시작 카드 가운데에 두는 그림이다. 1단계 기본 막대(과자 3cm, 두꺼운 초코 9cm)를 정답 자리에서 반으로 잘라
// 두 조각을 살짝 벌리고, 그 틈에 위에서 내려온 칼날과 짧은 효과선을 그린다. 효과선은 초코 윗면(y=22)보다 위에서
// 칼을 사이에 두고 좌우 대칭으로 뻗는다.
const BASIC_STICK = Object.freeze({
  almonds: [],
  cells: [...new Array(6).fill("NONE"), ...new Array(18).fill("THICK")]
});
const BASIC_CUT_X = toStickX(answerPosition(BASIC_STICK));
const GAP = 16;

export function CutStickArtwork() {
  const id = useId().replace(/:/g, "");
  return (
    <svg aria-hidden="true" className="cut-stick-artwork" viewBox="-40 -70 1080 210">
      <defs>
        <clipPath id={`${id}-left`}>
          <rect height="300" width={BASIC_CUT_X + 100} x="-100" y="-100" />
        </clipPath>
        <clipPath id={`${id}-right`}>
          <rect height="300" width={1200 - BASIC_CUT_X} x={BASIC_CUT_X} y="-100" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-left)`} transform={`translate(${-GAP} 0)`}>
        <StickArt stick={BASIC_STICK} />
      </g>
      <g clipPath={`url(#${id}-right)`} transform={`translate(${GAP} 0)`}>
        <StickArt stick={BASIC_STICK} />
      </g>
      <g className="cut-stick-artwork__sparks">
        {[-1, 1].map((side) => (
          <g key={side} transform={`translate(${BASIC_CUT_X} 0) scale(${side} 1)`}>
            <path d="M34 -50 L22 -16" />
            <path d="M74 -22 L34 4" />
            <path d="M88 12 L40 12" />
          </g>
        ))}
      </g>
      {/* 칼 그림은 손잡이가 아래라서 위아래로 뒤집어, 칼끝이 막대 아래로 조금 나오게 둔다. */}
      <g transform={`translate(${BASIC_CUT_X} 127) scale(1 -1)`}>
        <Knife x={0} />
      </g>
    </svg>
  );
}
