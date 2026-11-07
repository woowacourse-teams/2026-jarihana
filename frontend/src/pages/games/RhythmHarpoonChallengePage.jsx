import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

import { HeartIcon } from "../../features/game/rhythm/HeartIcon.jsx";
import { LEVELS } from "../../features/game/rhythm/engine.mjs";
import { readOffset } from "../../features/game/rhythm/calibration.mjs";
import { browserStorage } from "../../features/game/rhythm/lesson.mjs";
import {
  keyLabel,
  readKeymap,
  readPracticeSettings
} from "../../features/game/rhythm/preferences.mjs";
import { rhythmRankedApi } from "../../features/game/rhythm/rankedApi.js";
import { RhythmRankedBoard } from "../../features/game/rhythm/RhythmRankedBoard.jsx";
import { RhythmRanking } from "../../features/game/rhythm/RhythmRanking.jsx";
import { RhythmOffsetSettings } from "../../features/game/rhythm/RhythmOffsetSettings.jsx";
import { useEscapeBack } from "../../features/game/rhythm/useEscapeBack.js";
import { toUserMessage } from "../../shared/api";
import "../../features/game/rhythm/rhythm-challenge.css";
import "./rhythm-harpoon.css";

const SINGLE_PATH = "/games/rhythm-harpoon/single";
const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const INVALID_COPY = {
  ABANDONED: "Esc를 누르거나 다른 창, 탭으로 옮겨서 이번 도전은 무효가 됐어요.",
  LAGGED: "진행이 멈췄다가 이어져서 이번 도전은 무효가 됐어요. 화면을 떠나지 않고 끝까지 해 주세요.",
  CLOCK_AHEAD: "진행 시각이 서버 시간과 맞지 않아 이번 도전은 무효가 됐어요.",
  STALE: "입력이 서버에 한동안 닿지 않아 이번 도전은 무효가 됐어요.",
  EXPIRED: "시작하지 않은 채 시간이 지나 이번 도전은 무효가 됐어요."
};
const number = (value) => value.toLocaleString("ko-KR");

// 판에서 쓰는 개인 설정이다. 연습에서 맞춘 음량, 표시, 키 배치, 입력 지연 보정을 그대로 가져온다.
function readRunSettings() {
  const storage = browserStorage();
  const practice = readPracticeSettings(storage);
  return {
    keymap: readKeymap(storage),
    offset: readOffset(storage),
    volume: practice?.volume ?? 65,
    timingFeedback: practice?.timingFeedback ?? true,
    labels: practice?.labels ?? true
  };
}

function initialOptions() {
  const storage = browserStorage();
  const practice = readPracticeSettings(storage);
  return {
    level: practice?.level ?? "easy",
    scrollSpeed: practice?.rate ?? 1,
    offset: readOffset(storage)
  };
}

export function RhythmHarpoonChallengePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("options");
  const [options, setOptions] = useState(initialOptions);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [settings, setSettings] = useState(readRunSettings);
  // 입력 지연 보정은 옵션 단계에서 고른 값을 판에 그대로 쓴다.
  const [boardSettings, setBoardSettings] = useState(null);

  // 확인 단계에 들어올 때마다 연습에서 바꾼 키 배치와 표시 설정을 다시 읽는다.
  const confirm = () => {
    setSettings(readRunSettings());
    setStep("confirm");
  };

  useEscapeBack(() => {
    if (step === "confirm") setStep("options");
    else if (step === "playing") {
      // 시작 전에 Esc를 누르면 만든 도전을 버리고 확인 단계로 돌아간다. 시작한 뒤의 Esc는 게임이 무효로 처리한다.
      if (session) void rhythmRankedApi.abandon(session.challengeId).catch(() => {});
      setSession(null);
      confirm();
    } else navigate(SINGLE_PATH);
  });

  async function startChallenge() {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await rhythmRankedApi.create({
        level: options.level,
        scrollSpeed: options.scrollSpeed
      });
      setBoardSettings({ ...settings, offset: options.offset });
      setSession({
        challengeId: created.challengeId,
        seed: created.seed,
        level: options.level,
        scrollSpeed: created.scrollSpeed,
        chartVersion: created.chartVersion
      });
      setResult(null);
      setInvalid(null);
      setStep("playing");
    } catch (error) {
      setCreateError(toUserMessage(error));
    } finally {
      setCreating(false);
    }
  }

  const handleFinished = useCallback((state) => {
    setResult(state);
    setStep("result");
  }, []);
  const handleInvalid = useCallback((reason) => {
    setInvalid(INVALID_COPY[reason] ?? INVALID_COPY.ABANDONED);
    setStep("invalid");
  }, []);
  const handleError = useCallback((error) => {
    setInvalid(
      (error instanceof Error && !("code" in error) ? error.message : toUserMessage(error)) +
        " 이번 도전은 기록되지 않아요."
    );
    setStep("invalid");
  }, []);

  return (
    <section className="game-player rhythm-challenge-page" aria-labelledby="rhythm-challenge-title">
      <header className="game-player__toolbar">
        <Link
          aria-keyshortcuts="Escape"
          className="game-player__back"
          data-ph-capture-attribute-action="rhythm_single_back"
          to={SINGLE_PATH}
        >
          <ArrowLeft aria-hidden="true" size={18} />
          싱글 플레이
        </Link>
        <h1 id="rhythm-challenge-title">공식 도전</h1>
        <ol className="rhythm-challenge-steps" aria-label="진행 단계">
          {[
            ["options", "옵션"],
            ["confirm", "확인"],
            ["playing", "도전"],
            ["result", "결과"]
          ].map(([id, label]) => (
            <li
              aria-current={
                step === id || (id === "result" && step === "invalid") ? "step" : undefined
              }
              key={id}
            >
              {label}
            </li>
          ))}
        </ol>
      </header>
      {step === "playing" && session ? (
        <RhythmRankedBoard
          onError={handleError}
          onFinished={handleFinished}
          onInvalid={handleInvalid}
          session={session}
          settings={boardSettings}
        />
      ) : (
        <div className="rhythm-game">
          <div className="rhythm-game__body rhythm-challenge">
            {step === "options" ? (
              <OptionsStep onChange={setOptions} onNext={confirm} options={options} />
            ) : null}
            {step === "confirm" ? (
              <ConfirmStep
                creating={creating}
                error={createError}
                onBack={() => setStep("options")}
                onStart={startChallenge}
                options={options}
                settings={settings}
              />
            ) : null}
            {step === "result" && result ? (
              <ResultStep
                level={options.level}
                onOptions={() => setStep("options")}
                onRetry={confirm}
                result={result}
              />
            ) : null}
            {step === "invalid" ? (
              <InvalidStep
                message={invalid}
                onOptions={() => setStep("options")}
                onRetry={confirm}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function OptionsStep({ options, onChange, onNext }) {
  return (
    <section className="rhythm-challenge__panel" aria-labelledby="rhythm-challenge-options">
      <span className="eyebrow">STEP 1 / OPTIONS</span>
      <h2 id="rhythm-challenge-options">옵션 설정</h2>
      <p className="small muted">
        난이도마다 랭킹이 따로 있어요. 세균 이동 배속은 보이는 속도만 바꾸고 판정과 점수에는 영향이
        없어요. 입력 지연 보정은 판정 시각을 옮기므로 시작 전에 꼭 맞춰 주세요.
      </p>
      <div className="control-section">
        <span className="eyebrow">DIFFICULTY</span>
        <div className="difficulty rhythm-challenge__levels" role="group" aria-label="난이도">
          {Object.entries(LEVELS).map(([id, level]) => (
            <button
              aria-pressed={options.level === id}
              data-level={id}
              data-ph-capture-attribute-action="rhythm_challenge_level_select"
              key={id}
              onClick={() => onChange({ ...options, level: id })}
              type="button"
            >
              {level.name}
              <small className="life-badge">
                <HeartIcon />
                <span className="sr-only">라이프</span>
                {level.lives}
              </small>
            </button>
          ))}
        </div>
        <p className="small muted">{LEVELS[options.level].description}</p>
      </div>
      <div className="control-section audio-controls">
        <label htmlFor="challenge-rate">세균 이동 배속</label>
        <select
          data-ph-capture-attribute-action="rhythm_challenge_speed_change"
          id="challenge-rate"
          onChange={(event) => onChange({ ...options, scrollSpeed: Number(event.target.value) })}
          value={String(options.scrollSpeed)}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={String(speed)}>
              ×{Number.isInteger(speed) ? speed.toFixed(1) : speed}
            </option>
          ))}
        </select>
      </div>
      <RhythmOffsetSettings
        offset={options.offset}
        onChange={(offset) => onChange((current) => ({ ...current, offset }))}
      />
      <div className="rhythm-challenge__actions">
        <button
          className="button primary"
          data-ph-capture-attribute-action="rhythm_challenge_next"
          onClick={onNext}
          type="button"
        >
          다음
        </button>
      </div>
    </section>
  );
}

function ConfirmStep({ options, settings, creating, error, onBack, onStart }) {
  const level = LEVELS[options.level];
  const keys = [settings.keymap.left, settings.keymap.down, settings.keymap.up, settings.keymap.right]
    .map(keyLabel)
    .join(" ");
  return (
    <section className="rhythm-challenge__panel" aria-labelledby="rhythm-challenge-confirm">
      <span className="eyebrow">STEP 2 / CHECK</span>
      <h2 id="rhythm-challenge-confirm">이 설정으로 도전할까요?</h2>
      <dl className="rhythm-challenge__summary">
        <div>
          <dt>난이도</dt>
          <dd>
            {level.name} / 라이프 {level.lives}
          </dd>
        </div>
        <div>
          <dt>세균 이동 배속</dt>
          <dd>×{options.scrollSpeed}</dd>
        </div>
        <div>
          <dt>입력 지연 보정</dt>
          <dd>{(options.offset > 0 ? "+" : "") + options.offset}ms</dd>
        </div>
        <div>
          <dt>조작 키</dt>
          <dd>방향키 또는 {keys}</dd>
        </div>
      </dl>
      <ul className="rhythm-challenge__rules">
        <li>시작하면 멈출 수 없어요. 라이프를 모두 잃을 때까지 이어져요.</li>
        <li>Esc를 누르거나 다른 창, 탭으로 옮기면 이번 도전은 기록 없이 무효예요.</li>
        <li>점수는 서버가 입력을 받아 다시 계산하고, 난이도별 최고 기록으로 랭킹에 올라가요.</li>
      </ul>
      <p className="small muted">
        키 배치는{" "}
        <Link data-ph-capture-attribute-action="rhythm_practice_open" to="/games/rhythm-harpoon/practice">
          혼자 연습
        </Link>
        의 설정에서 바꿔요.
      </p>
      {error ? (
        <p className="rhythm-challenge__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rhythm-challenge__actions">
        <button
          className="button subtle"
          data-ph-capture-attribute-action="rhythm_challenge_options"
          onClick={onBack}
          type="button"
        >
          옵션 바꾸기
        </button>
        <button
          className="button primary"
          data-ph-capture-attribute-action="rhythm_challenge_start"
          disabled={creating}
          onClick={onStart}
          type="button"
        >
          {creating ? "도전 준비 중" : "도전 시작"}
        </button>
      </div>
    </section>
  );
}

function ResultStep({ level, result, onRetry, onOptions }) {
  const rows = [
    ["PERFECT", result.perfect, "perfect"],
    ["HIT", result.hit, "hit"],
    ["ENOUGH", result.enough, "enough"],
    ["Uh oh", result.uhoh, "uhoh"],
    ["놓친 세균", result.miss, null],
    ["헛공격", result.poor, null]
  ];
  return (
    <div className="rhythm-challenge__result">
      <section className="rhythm-challenge__panel rhythm-result" aria-labelledby="rhythm-result-title">
        <span className="eyebrow">STEP 4 / RESULT</span>
        <h2 id="rhythm-result-title">{LEVELS[level].name} 도전 결과</h2>
        <p className="rhythm-result__score">
          <small>서버 확인 점수</small>
          <strong>{number(result.score)}</strong>
        </p>
        <table className="result-table">
          <caption className="sr-only">공식 도전 결과</caption>
          <thead>
            <tr>
              <th scope="row">
                MAX COMBO<span className="sr-only">최고 콤보</span>
              </th>
              <td>{number(result.bestCombo)}</td>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, kind]) => (
              <tr className={kind ? "result-judgment result-judgment--" + kind : undefined} key={label}>
                <th scope="row">
                  <span>{label}</span>
                </th>
                <td>{number(value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                LOOP<span className="sr-only">도달 루프</span>
              </th>
              <td>{result.loopReached}</td>
            </tr>
          </tfoot>
        </table>
        <div className="rhythm-challenge__actions">
          <button
            className="button subtle"
            data-ph-capture-attribute-action="rhythm_challenge_options"
            onClick={onOptions}
            type="button"
          >
            옵션 바꾸기
          </button>
          <button
            className="button primary"
            data-ph-capture-attribute-action="rhythm_challenge_retry"
            onClick={onRetry}
            type="button"
          >
            다시 도전
          </button>
        </div>
      </section>
      <RhythmRanking level={level} />
    </div>
  );
}

function InvalidStep({ message, onRetry, onOptions }) {
  return (
    <section className="rhythm-challenge__panel" aria-labelledby="rhythm-invalid-title">
      <span className="eyebrow">NOT RECORDED</span>
      <h2 id="rhythm-invalid-title">이번 도전은 무효예요</h2>
      <p role="alert">{message}</p>
      <div className="rhythm-challenge__actions">
        <button
          className="button subtle"
          data-ph-capture-attribute-action="rhythm_challenge_options"
          onClick={onOptions}
          type="button"
        >
          옵션 바꾸기
        </button>
        <button
          className="button primary"
          data-ph-capture-attribute-action="rhythm_challenge_retry"
          onClick={onRetry}
          type="button"
        >
          다시 도전
        </button>
      </div>
    </section>
  );
}
