import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { RhythmBoardArt } from "../../features/game/rhythm/RhythmBoardArt.jsx";
import "../../features/game/rhythm/rhythm-game.css";
import "../../features/game/rhythm/rhythm-hub.css";
import "./rhythm-harpoon.css";

export function RhythmHarpoonEntryPage() {
  return (
    <section className="game-player" aria-labelledby="rhythm-entry-title">
      <header className="game-player__toolbar">
        <Link className="game-player__back" data-ph-capture-attribute-action="games_back" to="/games">
          <ArrowLeft aria-hidden="true" size={18} />
          게임방
        </Link>
        <h1 id="rhythm-entry-title">행성이의 리듬 작살</h1>
      </header>
      <div className="rhythm-game">
        <div className="rhythm-game__body rhythm-hub">
          <p className="rhythm-hub__lead">혼자 할지, 함께 할지 골라요.</p>
          <div className="rhythm-entry">
            <Link
              className="rhythm-entry__panel"
              data-ph-capture-attribute-action="rhythm_single_open"
              to="/games/rhythm-harpoon/single"
            >
              <RhythmBoardArt />
              <span className="rhythm-entry__name">싱글 플레이</span>
              <span className="rhythm-entry__copy">따라 하기, 혼자 연습, 공식 도전</span>
            </Link>
            <button
              className="rhythm-entry__panel"
              data-ph-capture-attribute-action="rhythm_online_open"
              disabled
              type="button"
            >
              <RhythmBoardArt variant="duo" />
              <span className="rhythm-entry__name">온라인 매칭</span>
              <span className="rhythm-entry__copy">대기실에서 방을 만들어 1:1로 겨뤄요</span>
              <span className="rhythm-hub__badge">준비 중</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
