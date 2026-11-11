import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorState, Modal, Skeleton } from "../../shared/ui";
import { CutFacts, CutResult, formatPercent, prefersReducedMotion } from "./CutResult";
import {
  DISPLAY_MAX_PER_STICK,
  MAX_SCORE,
  ROUND_COUNT,
  ROUND_TIME_LIMIT_SECONDS,
  STICK_LENGTH_CM,
  formatPoints
} from "./puzzle";
import { COARSE_NUDGE_STEPS, NUDGE_CM, StickBoard, clampPosition } from "./StickBoard";
import "./stick-halving.css";

const POINTS_DELAY_MILLIS = 250;
const POINTS_DURATION_MILLIS = 700;

function commentFor(round, errorRate, position) {
  if (round === 1 && Math.abs(position - STICK_LENGTH_CM / 2) < 0.15) {
    return "가운데를 잘랐네요. 초코 쪽이 더 무거워요.";
  }
  if (errorRate < 0.005) return "거의 완벽하게 나눴어요.";
  if (errorRate < 0.02) return "꽤 공평해요.";
  if (errorRate < 0.05) return "한쪽이 조금 더 무거워요.";
  return "한쪽이 확실히 무거워요.";
}

// 남은 시간은 큰 숫자와 그 아래의 가는 막대로 보여 준다. 3초 남으면 빨갛게 바꾼다.
function Timer({ deadline, now, limitSeconds }) {
  const left = Math.max(0, (deadline - now) / 1000);
  const low = left <= 3;
  return (
    <div className={`stick-game__timer${low ? " stick-game__timer--low" : ""}`} role="timer">
      <p className="stick-game__timer-text">
        <span className="stick-game__timer-number">{Math.ceil(left)}</span>초 남음
      </p>
      <div aria-hidden="true" className="stick-game__timer-track">
        <div className="stick-game__timer-fill" style={{ transform: `scaleX(${(left / limitSeconds).toFixed(4)})` }} />
      </div>
    </div>
  );
}

// 이번 막대 점수를 0부터 올려 보여 준다. 화면 읽기 프로그램에는 오르는 숫자 대신 최종 점수만 읽힌다.
// 움직임 줄이기 설정에서는 바로 최종 점수를 보여 준다.
function CountUpPoints({ score }) {
  const still = prefersReducedMotion() || typeof requestAnimationFrame !== "function";
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (still) return undefined;
    let frame = 0;
    const startedAt = performance.now() + POINTS_DELAY_MILLIS;
    const step = (time) => {
      const progress = Math.min(1, Math.max(0, (time - startedAt) / POINTS_DURATION_MILLIS));
      setShown(Math.round(score * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [score, still]);
  const value = still ? score : shown;
  return (
    <span className="stick-game__points">
      <span aria-hidden="true">+{formatPoints(value)}점</span>
      <span className="ui-sr-only">+{formatPoints(score)}점</span>
    </span>
  );
}

// 몇 번째 막대인지 점 5개와 숫자로 보여 준다. 막대 유형 이름은 보여 주지 않는다.
function Progress({ round }) {
  return (
    <p className="stick-game__progress">
      <span aria-hidden="true" className="stick-game__dots">
        {Array.from({ length: ROUND_COUNT }, (_, index) => {
          const state = index + 1 === round ? " stick-game__dot--now" : index + 1 < round ? " stick-game__dot--done" : "";
          return <i className={`stick-game__dot${state}`} key={index} />;
        })}
      </span>
      <span className="stick-game__round-count">{round}/{ROUND_COUNT}</span>
    </p>
  );
}

// 막대 5개를 차례로 자르는 한 판이다. 막대를 받아오고 판정하는 방법은 adapter가 정한다.
// 연습은 브라우저에서, 순위 도전은 서버에서 막대를 만들고 판정한다. 다음 막대는 결과를 본 회원이
// "다음 막대"를 눌렀을 때 받고, adapter가 remainingMillis를 주면 서버 마감 기준으로 남은 시간을 센다.
// 서버는 요청을 받은 뒤에 막대를 내주므로, 요청을 보낸 시각부터 remainingMillis를 세면 응답이 늦게 와도
// 화면이 서버 마감보다 긴 시간을 보여 주지 않는다. label은 연습인지 순위 도전인지 머리 줄에 붙이는 이름이다.
export function StickHalvingGame({
  adapter,
  errorMessage,
  finalActions,
  label,
  onFinish,
  timeLimitSeconds = ROUND_TIME_LIMIT_SECONDS
}) {
  const [phase, setPhase] = useState("starting");
  const [round, setRound] = useState(1);
  const [stick, setStick] = useState(null);
  const [position, setPosition] = useState(STICK_LENGTH_CM / 2);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [outcome, setOutcome] = useState(null);
  const [rows, setRows] = useState([]);
  const [totalScore, setTotalScore] = useState(0);
  const [error, setError] = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const positionReference = useRef(position);
  const phaseReference = useRef(phase);
  const startedReference = useRef(false);

  useEffect(() => {
    positionReference.current = position;
  }, [position]);

  useEffect(() => {
    phaseReference.current = phase;
  }, [phase]);

  const begin = useCallback(({ remainingMillis, round: nextRound, stick: nextStick }, requestedAt) => {
    setRound(nextRound);
    setStick(nextStick);
    setPosition(clampPosition(nextStick.startPosition));
    setOutcome(null);
    setAnalysisOpen(false);
    setDeadline(remainingMillis == null ? Date.now() + timeLimitSeconds * 1000 : requestedAt + remainingMillis);
    setNow(Date.now());
    setPhase("play");
  }, [timeLimitSeconds]);

  useEffect(() => {
    if (startedReference.current) return;
    startedReference.current = true;
    const requestedAt = Date.now();
    Promise.resolve(adapter.start())
      .then((started) => begin(started, requestedAt))
      .catch((startError) => {
        setError(startError);
        setPhase("error");
      });
  }, [adapter, begin]);

  const submit = useCallback((timedOutOnClient) => {
    if (phaseReference.current !== "play") return;
    phaseReference.current = "cutting";
    setPhase("cutting");
    const cutPosition = positionReference.current;
    Promise.resolve(adapter.cut(round, cutPosition))
      .then((result) => {
        setOutcome({ ...result, position: cutPosition, timedOut: result.timedOut || timedOutOnClient });
        setRows((previous) => [
          ...previous,
          {
            errorRate: result.errorRate,
            name: `${round}번 막대`,
            round,
            score: result.score
          }
        ]);
        setTotalScore(result.totalScore);
        setPhase("result");
      })
      .catch((cutError) => {
        setError(cutError);
        setPhase("error");
      });
  }, [adapter, round]);

  useEffect(() => {
    if (phase !== "play") return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) submit(true);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline, phase, submit]);

  // 막대에 포커스가 없어도 좌우 방향키로 칼을 옮기고 Enter로 자른다. 막대가 이미 처리한 키, 입력 칸에서 누른 키,
  // 단축키 조합은 건드리지 않는다. Enter는 다른 버튼이나 링크를 누르는 키이기도 해서, 그런 곳에 포커스가 있으면 자르지 않는다.
  useEffect(() => {
    if (phase !== "play") return undefined;
    function handleKeyDown(event) {
      const arrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (!arrow && event.key !== "Enter") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      if (!arrow) {
        if (event.repeat || (target instanceof HTMLElement && target.closest("button, a, [role='button']"))) return;
        event.preventDefault();
        submit(false);
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? NUDGE_CM * COARSE_NUDGE_STEPS : NUDGE_CM;
      setPosition((current) => clampPosition(current + (event.key === "ArrowLeft" ? -step : step)));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, submit]);

  // 자르기와 다음 막대는 같은 자리의 같은 버튼이라 커서를 옮기지 않고 이어서 누를 수 있다. 다만 더블클릭의
  // 두 번째 클릭(detail > 1)이 결과를 건너뛰거나 새 막대를 바로 자르지 않도록 양쪽 모두 무시한다.
  function next(event) {
    if (event?.detail > 1) return;
    if (!outcome || phaseReference.current !== "result") return;
    if (outcome.finished) {
      setPhase("final");
      onFinish?.({ rows, totalScore });
      return;
    }
    phaseReference.current = "issuing";
    setPhase("issuing");
    const requestedAt = Date.now();
    Promise.resolve(adapter.next(round + 1))
      .then((issued) => begin(issued, requestedAt))
      .catch((nextError) => {
        setError(nextError);
        setPhase("error");
      });
  }

  if (phase === "error") {
    return (
      <div className="stick-game">
        <ErrorState description={errorMessage?.(error) ?? "잠시 뒤 다시 시도해 주세요."} title="게임을 이어 갈 수 없어요" />
        {finalActions ? <div className="stick-game__actions">{finalActions({ rows, totalScore })}</div> : null}
      </div>
    );
  }

  if (phase === "starting" || !stick) {
    return (
      <div className="stick-game">
        <Skeleton aria-label="막대를 준비하는 중" className="stick-game__loading" />
      </div>
    );
  }

  if (phase === "final") {
    return (
      <section aria-label="최종 결과" className="stick-game stick-game--final">
        <p className="stick-game__eyebrow">최종 결과</p>
        <p className="stick-game__final-score">
          <span>{formatPoints(totalScore)}</span>
          <small>/ {DISPLAY_MAX_PER_STICK * ROUND_COUNT}점</small>
        </p>
        <div className="stick-game__table-wrap">
          <table className="stick-game__table">
            <thead>
              <tr>
                <th scope="col">막대</th>
                <th className="stick-game__number" scope="col">오차</th>
                <th className="stick-game__number" scope="col">점수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.round}>
                  <td>{row.name}</td>
                  <td className="stick-game__number">{formatPercent(row.errorRate)}</td>
                  <td className="stick-game__number">
                    <span className="stick-game__score-cell">
                      <span aria-hidden="true" className="stick-game__score-bar">
                        <span style={{ inlineSize: `${(row.score / MAX_SCORE) * 100}%` }} />
                      </span>
                      <strong>{formatPoints(row.score)}</strong>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {finalActions ? <div className="stick-game__actions">{finalActions({ rows, totalScore })}</div> : null}
      </section>
    );
  }

  const showingResult = (phase === "result" || phase === "issuing") && outcome;

  // 자르는 화면과 결과 화면을 같은 칸에 겹쳐 두어 높이를 맞춘다. 결과를 보는 동안 자르는 화면은 숨기지만
  // 자리는 차지하므로, 그 아래 버튼 줄이 움직이지 않는다. 자르기와 다음 막대는 같은 버튼이 이름만 바뀐다.
  // 결과의 한 줄 평과 점수는 머리 줄 가운데(왼쪽 진행, 오른쪽 누적 점수 사이)에, 저울은 그 아래에 둔다.
  // 점수와 저울이 차례로 떠오르고(stick-halving.css), 자른 위치와 정답은 분석하기 모달에서 본다.
  return (
    <section
      aria-label="게임"
      className={`stick-game${showingResult ? " stick-game--result" : ""}`}
    >
      <div className="stick-game__head">
        <Progress round={round} />
        {showingResult ? (
          <p className="stick-game__verdict" role="status">
            <span className="stick-game__comment">{commentFor(round, outcome.errorRate, outcome.position)}</span>
            <span className="stick-game__score-line">
              <CountUpPoints score={outcome.score} />
              <span className="stick-game__error">오차 {formatPercent(outcome.errorRate)}</span>
            </span>
          </p>
        ) : null}
        <div className="stick-game__meta">
          {label ? <span className="stick-game__mode">{label}</span> : null}
          <p className="stick-game__running">누적 <strong>{formatPoints(totalScore)}</strong>점</p>
        </div>
      </div>
      <div className="stick-game__stage">
        <div
          aria-hidden={showingResult ? true : undefined}
          className={`stick-game__play${showingResult ? " stick-game__layer--hidden" : ""}`}
          inert={showingResult ? true : undefined}
          key={round}
        >
          <div className="stick-game__lead">
            <h2 className="stick-game__title">같은 무게가 되게 반으로 잘라 보세요</h2>
            <p className="stick-game__subtitle">초코와 아몬드가 붙은 곳이 더 무거워요</p>
          </div>
          <Timer deadline={deadline} limitSeconds={timeLimitSeconds} now={now} />
          <StickBoard
            locked={phase !== "play"}
            onPositionChange={setPosition}
            onSubmit={() => submit(false)}
            position={showingResult ? outcome.position : position}
            stick={stick}
          />
          <p className="stick-game__hint">
            <span className="stick-game__hint-touch">막대를 끌어서 칼을 옮겨요</span>
            <span className="stick-game__keys">
              막대를 끌거나 <kbd>←</kbd><kbd>→</kbd>로 옮기고 <kbd>Enter</kbd>로 잘라요
            </span>
          </p>
        </div>
        {showingResult ? (
          <div className="stick-game__result">
            <div className="stick-game__balance">
              <CutResult position={outcome.position} stick={stick} />
            </div>
          </div>
        ) : null}
      </div>
      <div className="stick-game__actions">
        <Button
          className="stick-game__primary"
          data-ph-capture-attribute-action={showingResult ? "stick_next_round" : "stick_cut_submit"}
          onClick={showingResult ? next : (event) => {
            if (event.detail > 1) return;
            submit(false);
          }}
          pending={phase === "cutting" || phase === "issuing"}
          size="lg"
        >
          {showingResult ? (outcome.finished ? "최종 결과 보기" : "다음 막대") : "자르기"}
        </Button>
        {showingResult ? (
          <button
            className="stick-game__analyze"
            data-ph-capture-attribute-action="stick_cut_analyze"
            onClick={() => setAnalysisOpen(true)}
            type="button"
          >
            분석하기
          </button>
        ) : (
          <span aria-hidden="true" className="stick-game__analyze stick-game__analyze--placeholder" />
        )}
      </div>
      {showingResult ? (
        <Modal
          closeAction="stick_analysis_close"
          onOpenChange={setAnalysisOpen}
          open={analysisOpen}
          panelClassName="stick-analysis"
          title={`${round}번 막대 분석`}
        >
          <StickBoard answerPosition={outcome.answerPosition} locked position={outcome.position} stick={stick} />
          <CutFacts position={outcome.position} result={outcome} />
        </Modal>
      ) : null}
    </section>
  );
}
