import { answerPosition, generatePracticeStick } from "./puzzle";
import { StickArt, toStickX } from "./StickArt";
import "./stick-halving.css";

// 게임방 카드에 쓰는 장식 그림이다. 아몬드가 붙은 막대 하나와, 정답 자리에 선 칼을 그린다.
const SAMPLE_STICK = generatePracticeStick(20261111, 4);
const KNIFE_X = toStickX(answerPosition(SAMPLE_STICK));

export function StickHalvingArtwork() {
  return (
    <svg aria-hidden="true" className="stick-artwork" viewBox="-80 -300 1160 773">
      <StickArt stick={SAMPLE_STICK} />
      <g className="stick-board__knife" transform={`translate(${KNIFE_X} 0)`}>
        <line x1="0" x2="0" y1="-70" y2="128" />
        <rect height="32" rx="16" width="64" x="-32" y="132" />
        <line className="stick-board__grip" x1="-8" x2="-8" y1="141" y2="155" />
        <line className="stick-board__grip" x1="0" x2="0" y1="141" y2="155" />
        <line className="stick-board__grip" x1="8" x2="8" y1="141" y2="155" />
      </g>
    </svg>
  );
}
