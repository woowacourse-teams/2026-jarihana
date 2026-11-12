import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import {
  RHYTHM_CHALLENGE_PATH,
  RHYTHM_ENTRY_PATH,
  RHYTHM_PRACTICE_PATH
} from "../../features/game/rhythm/availability.js";
import { RhythmModeArt } from "../../features/game/rhythm/RhythmModeArt.jsx";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import { useOpenChallenge } from "../../features/game/rhythm/useOpenChallenge.js";
import "../../features/game/rhythm/rhythm-game.css";
import "../../features/game/rhythm/rhythm-hub.css";
import "./rhythm-harpoon.css";

// 혼자 연습과 랭킹 도전 중 하나를 고른다. 따라 하기는 처음 화면에서 고른다.
// 혼자 연습을 닫아 둔 동안(availability.js)에는 이 화면 대신 랭킹 도전의 옵션 화면으로 바로 간다.
export function RhythmHarpoonSinglePage() {
  useEscapeBack(RHYTHM_ENTRY_PATH);
  const openChallenge = useOpenChallenge();

  return (
    <section className="game-player" aria-labelledby="rhythm-single-title">
      <header className="game-player__toolbar">
        <Link
          aria-keyshortcuts="Escape"
          className="game-player__back"
          data-ph-capture-attribute-action="rhythm_entry_back"
          to={RHYTHM_ENTRY_PATH}
        >
          <ArrowLeft aria-hidden="true" size={18} />
          처음 화면
        </Link>
        <h1 id="rhythm-single-title">싱글 플레이</h1>
      </header>
      <div className="rhythm-game rhythm-game--hub">
        <div className="rhythm-game__body rhythm-hub">
          <div className="rhythm-modes">
            <Link
              className="rhythm-mode rhythm-mode--practice"
              data-ph-capture-attribute-action="rhythm_practice_open"
              to={RHYTHM_PRACTICE_PATH}
            >
              <RhythmModeArt kind="practice" />
              <span className="eyebrow">PRACTICE</span>
              <strong>혼자 연습</strong>
              <span>언제든 멈추고 설정을 바꿀 수 있어요. 점수는 남지 않아요.</span>
            </Link>
            <Link
              className="rhythm-mode rhythm-mode--record"
              data-ph-capture-attribute-action="rhythm_ranked_open"
              onClick={openChallenge}
              to={RHYTHM_CHALLENGE_PATH}
            >
              <RhythmModeArt kind="record" />
              <span className="eyebrow">RECORD</span>
              <strong>랭킹 도전</strong>
              <span>
                점수가 난이도별 랭킹에 올라가요. 로그인이 필요하고, 시작하면 멈출 수 없어요.
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
