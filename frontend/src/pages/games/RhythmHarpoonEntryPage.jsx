import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Music2, Trophy } from "lucide-react";

import {
  RHYTHM_LESSON_PATH,
  RHYTHM_PRACTICE_ENABLED,
  RHYTHM_SINGLE_START_PATH
} from "../../features/game/rhythm/availability.js";
import { RhythmDemoBoard } from "../../features/game/rhythm/RhythmDemoBoard.jsx";
import { RhythmModeArt } from "../../features/game/rhythm/RhythmModeArt.jsx";
import {
  rememberRhythmTutorialOffered,
  shouldOfferRhythmTutorial
} from "../../features/game/rhythm/tutorialPrompt.js";
import { useOpenChallenge } from "../../features/game/rhythm/useOpenChallenge.js";
import { Button, Modal, PageContainer } from "../../shared/ui";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import "../../features/game/rhythm/rhythm-hub.css";
import "./games.css";

// 게임방 목록과 같은 카드 모양으로 싱글 플레이와 온라인 매칭 중 하나를 고르고,
// 그 아래의 TUTORIAL 카드(따라 하기)로 소리부터 익힐 수 있다.
// 혼자 연습을 닫아 둔 동안에는 싱글 플레이 대신 랭킹 도전 카드를 둔다. 두 카드의 그림 자리에서는 실제 판이 자동으로 돌고,
// 온라인 매칭 카드는 내 판과 상대 판 두 개를 나란히 돌린다.
// 처음 온 사람(tutorialPrompt.js의 쿠키)에게는 들어오자마자 튜토리얼을 볼지 한 번 묻는다.
export function RhythmHarpoonEntryPage() {
  useEscapeBack("/games");
  const openChallenge = useOpenChallenge();
  const [tutorialPromptOpen, setTutorialPromptOpen] = useState(() => shouldOfferRhythmTutorial());
  function closeTutorialPrompt() {
    rememberRhythmTutorialOffered();
    setTutorialPromptOpen(false);
  }
  return (
    <PageContainer>
      <div className="games-page games-page--catalog">
        <Link
          aria-keyshortcuts="Escape"
          className="games-back"
          data-ph-capture-attribute-action="games_back"
          to="/games"
        >
          <span>
            <ArrowLeft size={16} aria-hidden="true" /> 게임방
          </span>
        </Link>
        <header className="games-heading">
          <h1>행성이의 리듬 작살</h1>
          <p>혼자 할지, 함께 할지 골라요.</p>
        </header>
        <div className="games-catalog">
          <article
            className="games-card games-card--playable"
            aria-labelledby="rhythm-entry-single"
          >
            <div
              className="games-artwork games-card__visual rhythm-entry__visual"
              aria-hidden="true"
            >
              <RhythmDemoBoard />
            </div>
            {RHYTHM_PRACTICE_ENABLED ? (
              <div className="games-card__body">
                <h2 id="rhythm-entry-single">싱글 플레이</h2>
                <p>혼자 연습하거나 랭킹 도전에 나서요.</p>
                <Link
                  className="ui-button ui-button--primary ui-button--md ui-button--block games-card__cta"
                  data-ph-capture-attribute-action="rhythm_single_open"
                  to={RHYTHM_SINGLE_START_PATH}
                >
                  <Music2 size={20} aria-hidden="true" /> 싱글 플레이 시작
                </Link>
              </div>
            ) : (
              <div className="games-card__body">
                <h2 id="rhythm-entry-single">랭킹 도전</h2>
                <p>난이도를 골라 바로 도전해요. 점수가 랭킹에 올라가요.</p>
                {/* 랭킹 도전은 회원 전용이라 로그인 전이면 여기서 로그인으로 보낸다. */}
                <Link
                  className="ui-button ui-button--primary ui-button--md ui-button--block games-card__cta rhythm-entry__ranked-cta"
                  data-ph-capture-attribute-action="rhythm_ranked_open"
                  onClick={openChallenge}
                  to={RHYTHM_SINGLE_START_PATH}
                >
                  <Trophy size={20} aria-hidden="true" /> 랭킹 도전 시작
                </Link>
              </div>
            )}
          </article>
          <article className="games-card games-card--soon" aria-label="온라인 매칭, 준비 중">
            <div
              className="games-artwork games-card__visual rhythm-entry__visual"
              aria-hidden="true"
            >
              <RhythmDemoBoard variant="duo" />
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
          <Link
            className="rhythm-entry-lesson"
            data-ph-capture-attribute-action="rhythm_lesson_open"
            to={RHYTHM_LESSON_PATH}
          >
            <RhythmModeArt kind="lesson" />
            <strong>TUTORIAL</strong>
            <span>1분이면 끝나요.</span>
          </Link>
        </div>
      </div>
      <Modal
        closeAction="rhythm_tutorial_prompt_close"
        onOpenChange={(open) => {
          if (!open) closeTutorialPrompt();
        }}
        open={tutorialPromptOpen}
        panelClassName="rhythm-tutorial-prompt"
        title="튜토리얼 보시겠어요?"
      >
        <p>1분이면 끝나요.</p>
        <div className="rhythm-tutorial-prompt__actions">
          <Button
            data-ph-capture-attribute-action="rhythm_tutorial_prompt_dismiss"
            onClick={closeTutorialPrompt}
            variant="secondary"
          >
            괜찮아요
          </Button>
          <Link
            className="ui-button ui-button--primary ui-button--md"
            data-ph-capture-attribute-action="rhythm_tutorial_prompt_accept"
            onClick={rememberRhythmTutorialOffered}
            to={RHYTHM_LESSON_PATH}
          >
            튜토리얼 보기
          </Link>
        </div>
      </Modal>
    </PageContainer>
  );
}
