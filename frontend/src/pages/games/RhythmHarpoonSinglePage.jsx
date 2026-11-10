import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

import { storeReturnTarget, useAuth } from "../../features/auth";
import { browserStorage, readLessonProgress } from "../../features/game/rhythm/lesson.mjs";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import "../../features/game/rhythm/rhythm-game.css";
import "../../features/game/rhythm/rhythm-hub.css";
import "./rhythm-harpoon.css";

const CHALLENGE_PATH = "/games/rhythm-harpoon/challenge";

export function RhythmHarpoonSinglePage() {
  useEscapeBack("/games/rhythm-harpoon");
  const { login, status } = useAuth();
  const navigate = useNavigate();
  // 공식 도전은 회원 전용이다. 로그인 전이면 회원 전용 가드가 자리 둘러보기로 보내기 전에
  // 로그인(또는 가입)으로 보내고, 마치면 공식 도전으로 돌아오게 한다.
  function openChallenge(event) {
    if (status === "authenticated") return;
    event.preventDefault();
    storeReturnTarget(CHALLENGE_PATH);
    if (status === "signup-required") navigate("/signup");
    else if (status === "anonymous") login();
  }
  const [progress] = useState(() => readLessonProgress(browserStorage()));

  return (
    <section className="game-player" aria-labelledby="rhythm-single-title">
      <header className="game-player__toolbar">
        <Link
          aria-keyshortcuts="Escape"
          className="game-player__back"
          data-ph-capture-attribute-action="rhythm_entry_back"
          to="/games/rhythm-harpoon"
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
              to="/games/rhythm-harpoon/practice"
            >
              <span className="eyebrow">PRACTICE</span>
              <strong>혼자 연습</strong>
              <span>
                Pixel Circuit 원곡으로 연습해요. 언제든 멈추고 설정을 바꿀 수 있고, 점수는 남지
                않아요.
              </span>
            </Link>
            <Link
              className="rhythm-mode rhythm-mode--record"
              data-ph-capture-attribute-action="rhythm_ranked_open"
              onClick={openChallenge}
              to={CHALLENGE_PATH}
            >
              <span className="eyebrow">RECORD</span>
              <strong>공식 도전</strong>
              <span>
                점수를 서버가 다시 계산해 난이도별 랭킹에 올려요. 로그인이 필요하고, 시작하면 멈출 수
                없어요.
              </span>
            </Link>
            <Link
              className="rhythm-mode rhythm-mode--lesson"
              data-ph-capture-attribute-action="rhythm_lesson_open"
              to="/games/rhythm-harpoon/learn"
            >
              <span className="eyebrow">TUTORIAL</span>
              <strong>
                따라 하기
                {progress.completed ? null : <span className="rhythm-hub__badge">처음이라면</span>}
              </strong>
              <span>빨강 쿵, 파랑 착, 노랑 치를 듣고 따라 쳐요. 1분이면 끝나요.</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
