import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorState, Skeleton } from "../../shared/ui";
import { CutFacts, CutResult, formatPercent } from "./CutResult";
import { ROUNDS, ROUND_COUNT, ROUND_TIME_LIMIT_SECONDS, STICK_LENGTH_CM } from "./puzzle";
import { COARSE_NUDGE_STEPS, NUDGE_CM, StickBoard, clampPosition } from "./StickBoard";
import "./stick-halving.css";

function commentFor(round, errorRate, position, timedOut) {
  const prefix = timedOut ? "시간이 다 돼서 그 자리에서 잘랐어요. " : "";
  if (round === 1 && Math.abs(position - STICK_LENGTH_CM / 2) < 0.15) {
    return `${prefix}가운데를 잘랐네요. 초코 쪽이 더 무거워요.`;
  }
  if (errorRate < 0.005) return `${prefix}거의 완벽하게 나눴어요.`;
  if (errorRate < 0.02) return `${prefix}꽤 공평해요.`;
  if (errorRate < 0.05) return `${prefix}한쪽이 조금 더 무거워요.`;
  return `${prefix}한쪽이 확실히 무거워요.`;
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

// 몇 번째 막대인지 점 5개와 숫자로 보여 준다.
function Progress({ name, round }) {
  return (
    <p className="stick-game__progress">
      <span aria-hidden="true" className="stick-game__dots">
        {Array.from({ length: ROUND_COUNT }, (_, index) => {
          const state = index + 1 === round ? " stick-game__dot--now" : index + 1 < round ? " stick-game__dot--done" : "";
          return <i className={`stick-game__dot${state}`} key={index} />;
        })}
      </span>
      <span className="stick-game__round-count">{round}/{ROUND_COUNT}</span>
      <span className="stick-game__round-name">{name}</span>
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
  const positionReference = useRef(position);
  const phaseReference = useRef(phase);
  const startedReference = useRef(false);
  const sectionReference = useRef(null);
  const revealReference = useRef(false);

  useEffect(() => {
    positionReference.current = position;
  }, [position]);

  useEffect(() => {
    phaseReference.current = phase;
  }, [phase]);

  // 결과를 보려고 아래로 내린 채 다음 막대로 넘어가면, 결과 블록이 사라지면서 화면이 아래 순위 쪽에 남는다.
  // 새 막대가 나오면 막대 번호부터 자르기 버튼까지가 보이도록 게임 영역 맨 위로 올린다.
  useEffect(() => {
    if (phase !== "play" || !revealReference.current) return;
    revealReference.current = false;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    sectionReference.current?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [phase]);

  const begin = useCallback(({ remainingMillis, round: nextRound, stick: nextStick }, requestedAt) => {
    setRound(nextRound);
    setStick(nextStick);
    setPosition(clampPosition(nextStick.startPosition));
    setOutcome(null);
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
            name: `${round} ${ROUNDS[round - 1].name}`,
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

  function next() {
    if (!outcome || phaseReference.current !== "result") return;
    if (outcome.finished) {
      setPhase("final");
      onFinish?.({ rows, totalScore });
      return;
    }
    phaseReference.current = "issuing";
    revealReference.current = true;
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
          <span>{totalScore.toLocaleString("ko-KR")}</span>
          <small>/ 5,000점</small>
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
                  <td className="stick-game__number">{row.score.toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {finalActions ? <div className="stick-game__actions">{finalActions({ rows, totalScore })}</div> : null}
      </section>
    );
  }

  const info = ROUNDS[round - 1];
  const showingResult = (phase === "result" || phase === "issuing") && outcome;
  const board = (
    <StickBoard
      answerPosition={showingResult ? outcome.answerPosition : null}
      locked={phase !== "play"}
      onPositionChange={setPosition}
      onSubmit={() => submit(false)}
      position={showingResult ? outcome.position : position}
      stick={stick}
    />
  );

  // 자를 때는 제목, 남은 시간, 막대, 자르기 버튼을 위에서 아래로 한 줄에 둔다.
  // 자른 뒤에는 넓은 화면에서 왼쪽에 자른 막대와 오차, 오른쪽에 점수와 저울, 다음 막대 버튼을 둔다.
  return (
    <section
      aria-label="게임"
      className={`stick-game${showingResult ? " stick-game--result" : ""}`}
      ref={sectionReference}
    >
      <div className="stick-game__head">
        <Progress name={info.name} round={round} />
        <div className="stick-game__meta">
          {label ? <span className="stick-game__mode">{label}</span> : null}
          <p className="stick-game__running">누적 <strong>{totalScore.toLocaleString("ko-KR")}</strong>점</p>
        </div>
      </div>
      {showingResult ? (
        <div className="stick-game__result">
          <p className="stick-game__verdict" role="status">
            <span className="stick-game__comment">
              {commentFor(round, outcome.errorRate, outcome.position, outcome.timedOut)}
            </span>
            <span className="stick-game__points">+{outcome.score.toLocaleString("ko-KR")}점</span>
          </p>
          <div className="stick-game__board">{board}</div>
          <div className="stick-game__facts">
            <CutFacts position={outcome.position} result={outcome} />
          </div>
          <div className="stick-game__balance">
            <CutResult position={outcome.position} stick={stick} />
          </div>
          <Button
            className="stick-game__primary stick-game__next"
            data-ph-capture-attribute-action="stick_next_round"
            onClick={next}
            pending={phase === "issuing"}
            size="lg"
          >
            {outcome.finished ? "최종 결과 보기" : "다음 막대"}
          </Button>
        </div>
      ) : (
        <div className="stick-game__play">
          <div className="stick-game__lead">
            <h2 className="stick-game__title">같은 무게가 되게 반으로 잘라 보세요</h2>
            <p className="stick-game__subtitle">초코와 아몬드가 붙은 곳이 더 무거워요</p>
          </div>
          <Timer deadline={deadline} limitSeconds={timeLimitSeconds} now={now} />
          {board}
          <p className="stick-game__hint">
            <span className="stick-game__hint-touch">막대를 끌어서 칼을 옮겨요</span>
            <span className="stick-game__keys">
              막대를 끌거나 <kbd>←</kbd><kbd>→</kbd>로 옮기고 <kbd>Enter</kbd>로 잘라요
            </span>
          </p>
          <Button
            className="stick-game__primary"
            data-ph-capture-attribute-action="stick_cut_submit"
            onClick={() => submit(false)}
            pending={phase === "cutting"}
            size="lg"
          >
            자르기
          </Button>
        </div>
      )}
    </section>
  );
}
