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

// 시작 카드 가운데에 두는 그림이다. 같은 막대를 정답 자리에서 반으로 잘라 두 조각을 살짝 벌려 그린다.
export function CutStickArtwork() {
  const id = useId().replace(/:/g, "");
  return (
    <svg aria-hidden="true" className="cut-stick-artwork" viewBox="-90 -40 1180 200">
      <defs>
        <clipPath id={`${id}-left`}>
          <rect height="300" width={KNIFE_X + 100} x="-100" y="-100" />
        </clipPath>
        <clipPath id={`${id}-right`}>
          <rect height="300" width={1200 - KNIFE_X} x={KNIFE_X} y="-100" />
        </clipPath>
      </defs>
      <g transform={`translate(-36 6) rotate(-4 ${KNIFE_X} 66)`}>
        <g clipPath={`url(#${id}-left)`}>
          <StickArt stick={SAMPLE_STICK} />
        </g>
      </g>
      <g transform={`translate(36 6) rotate(4 ${KNIFE_X} 66)`}>
        <g clipPath={`url(#${id}-right)`}>
          <StickArt stick={SAMPLE_STICK} />
        </g>
      </g>
    </svg>
  );
}
