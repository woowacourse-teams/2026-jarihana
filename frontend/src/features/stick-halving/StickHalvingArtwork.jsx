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
