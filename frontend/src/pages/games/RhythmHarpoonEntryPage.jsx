import { Link } from "react-router";
import { ArrowLeft, Music2 } from "lucide-react";

import { RhythmBoardArt } from "../../features/game/rhythm/RhythmBoardArt.jsx";
import { Button, PageContainer } from "../../shared/ui";
import "../../features/game/rhythm/rhythm-hub.css";
import "./games.css";

// 게임방 목록과 같은 카드 모양으로 싱글 플레이와 온라인 매칭 중 하나를 고른다.
export function RhythmHarpoonEntryPage() {
  return (
    <PageContainer>
      <div className="games-page games-page--catalog">
        <Link className="games-back" data-ph-capture-attribute-action="games_back" to="/games">
          <span>
            <ArrowLeft size={16} aria-hidden="true" /> 게임방
          </span>
        </Link>
        <header className="games-heading">
          <h1>행성이의 리듬 작살</h1>
          <p>혼자 할지, 함께 할지 골라요.</p>
        </header>
        <div className="games-catalog">
          <article className="games-card games-card--playable" aria-labelledby="rhythm-entry-single">
            <div className="games-artwork games-card__visual rhythm-entry__visual" aria-hidden="true">
              <RhythmBoardArt />
            </div>
            <div className="games-card__body">
              <h2 id="rhythm-entry-single">싱글 플레이</h2>
              <p>따라 하기로 소리를 익히고, 혼자 연습하거나 공식 도전에 나서요.</p>
              <Link
                className="ui-button ui-button--primary ui-button--md ui-button--block games-card__cta"
                data-ph-capture-attribute-action="rhythm_single_open"
                to="/games/rhythm-harpoon/single"
              >
                <Music2 size={20} aria-hidden="true" /> 싱글 플레이 시작
              </Link>
            </div>
          </article>
          <article className="games-card games-card--soon" aria-label="온라인 매칭, 준비 중">
            <div className="games-artwork games-card__visual rhythm-entry__visual" aria-hidden="true">
              <RhythmBoardArt variant="duo" />
            </div>
            <div className="games-card__body">
              <h2>온라인 매칭</h2>
              <p>대기실에서 방을 만들어 1:1로 겨뤄요.</p>
              <Button
                className="games-card__cta"
                block
                disabled
                data-ph-capture-attribute-action="rhythm_online_open"
              >
                준비 중
              </Button>
            </div>
          </article>
        </div>
      </div>
    </PageContainer>
  );
}
