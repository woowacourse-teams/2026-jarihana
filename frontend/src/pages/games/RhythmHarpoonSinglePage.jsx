import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { RhythmScore } from "../../features/game/rhythm/RhythmScore.jsx";
import {
  LESSON_STEPS,
  browserStorage,
  readLessonProgress
} from "../../features/game/rhythm/lesson.mjs";
import { playLessonPreview } from "../../features/game/rhythm/lesson-audio.mjs";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import "../../features/game/rhythm/rhythm-game.css";
import "../../features/game/rhythm/rhythm-hub.css";
import "./rhythm-harpoon.css";

const SOUND_CUES = ["빨강 / 박마다 오는 큰 북", "파랑 / 쿵과 쿵 사이", "노랑 / 더 잘게 쪼갠 소리"];

function SoundTutorial({ completed, onPreview }) {
  return (
    <>
      <h2 className="rhythm-hub__title">박자부터 귀로 익혀요</h2>
      <p className="rhythm-hub__copy">색마다 소리 이름이 있어요. 눌러서 한 마디씩 들어 보세요.</p>
      <div className="rhythm-sounds">
        {LESSON_STEPS.map((step, index) => (
          <button
            key={step.key}
            className={`rhythm-sound rhythm-sound--${step.key}`}
            data-ph-capture-attribute-action={`rhythm_sound_demo_${step.key}`}
            onClick={() => onPreview(index)}
            type="button"
          >
            <strong>{step.syllable}</strong>
            <span>{SOUND_CUES[index]}</span>
          </button>
        ))}
      </div>
      <div className="rhythm-hub__field">
        <span className="eyebrow">악보로 보면 (음악을 안다면 이쪽이 빨라요)</span>
        <div className="rhythm-scores">
          {LESSON_STEPS.map((step, index) => (
            <RhythmScore
              key={step.key}
              caption={(index ? "쿵 " + step.syllable : step.syllable) + ": " + step.notation}
              columns={step.pattern}
              label={step.syllable + " 패턴 악보"}
            />
          ))}
        </div>
      </div>
      <Link
        className={completed ? "button" : "button primary"}
        data-ph-capture-attribute-action="rhythm_lesson_open"
        to="/games/rhythm-harpoon/learn"
      >
        {completed ? "따라 하기 다시 하기" : "따라 하기 시작 (1분)"}
      </Link>
    </>
  );
}

export function RhythmHarpoonSinglePage() {
  useEscapeBack("/games/rhythm-harpoon");
  const [progress] = useState(() => readLessonProgress(browserStorage()));
  const preview = useRef(null);

  useEffect(
    () => () => {
      if (preview.current && preview.current.state !== "closed")
        void preview.current.close().catch(() => {});
      preview.current = null;
    },
    []
  );

  function playPreview(stepIndex) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (preview.current && preview.current.state !== "closed")
      void preview.current.close().catch(() => {});
    const context = new AudioContextClass();
    preview.current = context;
    const seconds = playLessonPreview(context, stepIndex);
    window.setTimeout(() => {
      if (preview.current === context) preview.current = null;
      if (context.state !== "closed") void context.close().catch(() => {});
    }, seconds * 1000);
  }

  const tutorial = <SoundTutorial completed={progress.completed} onPreview={playPreview} />;
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
      <div className="rhythm-game">
        <div className="rhythm-game__body rhythm-hub">
          {progress.completed ? (
            <details className="rhythm-fold">
              <summary data-ph-capture-attribute-action="rhythm_tutorial_toggle">
                <span>조작법을 다시 보고 싶다면?</span>
                <span className="rhythm-fold__action">
                  <span className="rhythm-fold__closed">펼치기 ▼</span>
                  <span className="rhythm-fold__open">접기 ▲</span>
                </span>
              </summary>
              <div className="rhythm-hub__panel">{tutorial}</div>
            </details>
          ) : (
            <section className="rhythm-hub__panel" aria-label="처음이라면 박자부터">
              <span className="rhythm-hub__badge">처음이라면</span>
              {tutorial}
            </section>
          )}
          <div className="rhythm-modes">
            <Link
              className="rhythm-mode"
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
            <button
              className="rhythm-mode rhythm-mode--record"
              data-ph-capture-attribute-action="rhythm_ranked_open"
              disabled
              type="button"
            >
              <span className="eyebrow">RECORD</span>
              <strong>
                공식 도전 <span className="rhythm-hub__badge">준비 중</span>
              </strong>
              <span>
                점수를 서버가 다시 계산하는 기록 기능을 만든 뒤 열어요. 시작하면 설정이 잠기고 멈출
                수 없어요.
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
