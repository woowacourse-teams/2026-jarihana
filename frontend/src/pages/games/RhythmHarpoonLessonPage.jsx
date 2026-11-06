import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { RhythmScore } from "../../features/game/rhythm/RhythmScore.jsx";
import {
  DEFAULT_LESSON_SETTINGS,
  LESSON_SPEEDS,
  LESSON_STEPS,
  LESSON_TEMPOS,
  NOTE_SYLLABLES,
  browserStorage,
  markLessonStep,
  readLessonProgress,
  skipLesson,
  writeLessonProgress
} from "../../features/game/rhythm/lesson.mjs";
import { mountLessonGame } from "../../features/game/rhythm/mount-lesson-game.mjs";
import "../../features/game/rhythm/rhythm-game.css";
import "../../features/game/rhythm/rhythm-hub.css";
import "./rhythm-harpoon.css";

const TOUCH_LANES = [
  ["left", "왼쪽", "←"],
  ["down", "아래", "↓"],
  ["up", "위", "↑"],
  ["right", "오른쪽", "→"]
];

function caughtCopy(result) {
  return result.total + "개 중 " + result.caught + "개를 잡았어요.";
}

function OverlayCard({ phase, step, result, progress, onListen, onTry, onNext }) {
  const tryButtons = (again) => (
    <div className="rhythm-lesson__actions">
      <button
        className="button"
        data-ph-capture-attribute-action="rhythm_lesson_listen"
        onClick={onListen}
        type="button"
      >
        {again ? "다시 듣기" : "들어보기"}
      </button>
      <button
        className="button primary"
        data-ph-capture-attribute-action="rhythm_lesson_try"
        onClick={onTry}
        type="button"
      >
        {again ? "다시 해보기" : "해보기"}
      </button>
    </div>
  );
  if (phase === "loading") return <p>판을 준비하고 있어요.</p>;
  if (phase === "error") return <p>판을 불러오지 못했어요. 페이지를 새로고침해 주세요.</p>;
  if (phase === "listened")
    return (
      <>
        <h2>들었나요?</h2>
        <p>이번엔 직접 쳐 봐요. {step.hint}</p>
        {tryButtons(false)}
      </>
    );
  if (phase === "retry")
    return (
      <>
        <h2>한 번 더</h2>
        <p>{caughtCopy(result)} 빠르기를 낮추거나 소리에 맞춰 눌러 보세요.</p>
        {tryButtons(true)}
      </>
    );
  if (phase === "interrupted" || phase === "failed")
    return (
      <>
        <h2>{phase === "failed" ? "시작하지 못했어요" : "중간에 멈췄어요"}</h2>
        <p>
          {phase === "failed"
            ? result?.error
            : "다른 창이나 탭으로 이동하면 따라 하기가 멈춰요."}
        </p>
        {tryButtons(true)}
      </>
    );
  if (phase === "passed") {
    const remaining = progress.done.findIndex((done) => !done);
    return (
      <>
        <h2>좋아요!</h2>
        <p>
          {caughtCopy(result)}
          {remaining < 0 ? " 세 소리를 다 익혔어요." : ""}
        </p>
        {remaining < 0 ? (
          <Link
            className="button primary"
            data-ph-capture-attribute-action="rhythm_lesson_finish"
            to="/games/rhythm-harpoon/single"
          >
            싱글 플레이로
          </Link>
        ) : (
          <button
            className="button primary"
            data-ph-capture-attribute-action="rhythm_lesson_next"
            onClick={() => onNext(remaining)}
            type="button"
          >
            다음 소리: {LESSON_STEPS[remaining].syllable}
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <h2>{step.syllable}</h2>
      <p>먼저 두 마디를 들어 보고, 이어서 네 마디를 쳐 봐요.</p>
      {tryButtons(false)}
    </>
  );
}

export function RhythmHarpoonLessonPage() {
  const rootReference = useRef(null);
  const playerReference = useRef(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [bpm, setBpm] = useState(DEFAULT_LESSON_SETTINGS.bpm);
  const [scrollSpeed, setScrollSpeed] = useState(DEFAULT_LESSON_SETTINGS.scrollSpeed);
  const [progress, setProgress] = useState(() => readLessonProgress(browserStorage()));
  const [phase, setPhase] = useState("loading");
  const [result, setResult] = useState(null);
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    const player = mountLessonGame({
      root: rootReference.current,
      onReady: () => setPhase("ready"),
      onError: () => setPhase("error"),
      onUpcoming: setUpcoming,
      onFinish: (outcome) => {
        setUpcoming([]);
        setResult(outcome);
        if (outcome.error) setPhase("failed");
        else if (outcome.interrupted) setPhase("interrupted");
        else if (outcome.auto) setPhase("listened");
        else if (!outcome.passed) setPhase("retry");
        else {
          setProgress((current) => {
            const next = markLessonStep(current, outcome.stepIndex);
            writeLessonProgress(browserStorage(), next);
            return next;
          });
          setPhase("passed");
        }
      }
    });
    playerReference.current = player;
    return () => {
      playerReference.current = null;
      player.dispose();
    };
  }, []);

  const step = LESSON_STEPS[stepIndex];
  const running = phase === "listening" || phase === "playing";
  const settled = phase !== "loading" && phase !== "error";

  function start(auto) {
    setResult(null);
    setPhase(auto ? "listening" : "playing");
    void playerReference.current?.play({ stepIndex, bpm, scrollSpeed, auto });
  }

  function reset(update) {
    playerReference.current?.stop();
    setResult(null);
    setUpcoming([]);
    if (settled) setPhase("ready");
    update();
  }

  return (
    <section className="game-player" aria-labelledby="rhythm-lesson-title">
      <header className="game-player__toolbar">
        <Link
          className="game-player__back"
          data-ph-capture-attribute-action="rhythm_single_back"
          to="/games/rhythm-harpoon/single"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          싱글 플레이
        </Link>
        <h1 id="rhythm-lesson-title">따라 하기</h1>
        <Link
          className="game-player__skip"
          data-ph-capture-attribute-action="rhythm_lesson_skip"
          onClick={() => writeLessonProgress(browserStorage(), skipLesson(progress))}
          to="/games/rhythm-harpoon/single"
        >
          건너뛰기
        </Link>
      </header>
      <div className="rhythm-game" ref={rootReference}>
        <div className="rhythm-game__body rhythm-lesson">
          <div className="game-layout">
            <section className="arena-shell" aria-label="따라 하기 판">
              <div role="application" aria-label="따라 하기 입력">
                <canvas
                  id="arena"
                  data-lesson-arena
                  data-ph-capture-attribute-action="rhythm_arena_focus"
                  width="900"
                  height="900"
                  tabIndex="0"
                  aria-label="따라 하기 판. 세균 중심이 굵은 판정선에 닿을 때 화살표 또는 WASD로 같은 방향을 눌러요"
                >
                  브라우저의 Canvas 지원이 필요해요.
                </canvas>
              </div>
              <div className="overlay" hidden={running}>
                <div className="overlay-card" aria-live="polite">
                  <OverlayCard
                    phase={phase}
                    progress={progress}
                    result={result}
                    step={step}
                    onListen={() => start(true)}
                    onNext={(index) => reset(() => setStepIndex(index))}
                    onTry={() => start(false)}
                  />
                </div>
              </div>
            </section>
            <aside className="controls rhythm-lesson__side">
              <nav className="rhythm-lesson__steps" aria-label="따라 하기 단계">
                {LESSON_STEPS.map((item, index) => (
                  <button
                    key={item.key}
                    aria-current={index === stepIndex ? "step" : undefined}
                    className={progress.done[index] ? "is-done" : undefined}
                    data-ph-capture-attribute-action={`rhythm_lesson_step_${item.key}`}
                    onClick={() => reset(() => setStepIndex(index))}
                    type="button"
                  >
                    <i className={`dot ${["red", "blue", "yellow"][index]}`} aria-hidden="true" />
                    {index + 1}. {item.syllable}
                  </button>
                ))}
              </nav>
              <div className="rhythm-lesson__head">
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <p className="muted">두 방향만 번갈아 나와요. 방향보다 소리에 맞추는 데 집중해요.</p>
              </div>
              <RhythmScore
                caption="악보로 보면, 지금 울리는 음표가 굵어져요"
                columns={step.pattern}
                label={step.syllable + " 패턴 악보"}
              />
              <div className="rhythm-upcoming" aria-hidden="true">
                <span className="eyebrow">다음 소리</span>
                {upcoming.map((color, index) => (
                  <span key={index} className={`rhythm-upcoming__chip rhythm-upcoming__chip--${color}`}>
                    {NOTE_SYLLABLES[color]}
                  </span>
                ))}
              </div>
              <div className="rhythm-lesson__control">
                <span className="eyebrow" id="lesson-tempo-label">
                  빠르기
                </span>
                <div className="rhythm-lesson__choices" role="group" aria-labelledby="lesson-tempo-label">
                  {LESSON_TEMPOS.map((tempo) => (
                    <button
                      key={tempo.bpm}
                      aria-pressed={tempo.bpm === bpm}
                      data-ph-capture-attribute-action={tempo.action}
                      onClick={() => reset(() => setBpm(tempo.bpm))}
                      type="button"
                    >
                      {tempo.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rhythm-lesson__control">
                <span className="eyebrow" id="lesson-speed-label">
                  세균 이동 배속
                </span>
                <div className="rhythm-lesson__choices" role="group" aria-labelledby="lesson-speed-label">
                  {LESSON_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      aria-pressed={speed === scrollSpeed}
                      data-ph-capture-attribute-action="rhythm_lesson_speed_change"
                      onClick={() => reset(() => setScrollSpeed(speed))}
                      type="button"
                    >
                      ×{speed.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
          <div className="touch-controls" aria-label="터치 방향키">
            {TOUCH_LANES.map(([lane, label, arrow]) => (
              <button
                key={lane}
                aria-label={label}
                data-lane={lane}
                data-ph-capture-attribute-action={`rhythm_input_${lane}`}
                type="button"
              >
                {arrow}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
