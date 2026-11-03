import { useCallback, useEffect, useRef, useState } from "react";

import { Button, ErrorState, Skeleton } from "../../shared/ui";
import { CutResult, formatPercent } from "./CutResult";
import { ROUNDS, ROUND_COUNT, ROUND_TIME_LIMIT_SECONDS, STICK_LENGTH_CM, errorRateAt, scoreOf } from "./puzzle";
import { NUDGE_CM, StickBoard, clampPosition } from "./StickBoard";
import { WeightTable } from "./WeightTable";
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

function Timer({ deadline, now, limitSeconds }) {
  const left = Math.max(0, (deadline - now) / 1000);
  const low = left <= 5;
  return (
    <div className={`stick-game__timer${low ? " stick-game__timer--low" : ""}`}>
      <div className="stick-game__timer-fill" style={{ transform: `scaleX(${(left / limitSeconds).toFixed(4)})` }} />
      <span className="stick-game__timer-text">{Math.ceil(left)}초 남음</span>
    </div>
  );
}

// 막대 5개를 차례로 자르는 한 판이다. 막대를 받아오고 판정하는 방법은 adapter가 정한다.
// 연습은 브라우저에서, 순위 도전은 서버에서 막대를 만들고 판정한다.
export function StickHalvingGame({ adapter, errorMessage, finalActions, onFinish, timeLimitSeconds = ROUND_TIME_LIMIT_SECONDS }) {
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

  useEffect(() => {
    positionReference.current = position;
  }, [position]);

  useEffect(() => {
    phaseReference.current = phase;
  }, [phase]);

  const begin = useCallback((nextRound, nextStick) => {
    setRound(nextRound);
    setStick(nextStick);
    setPosition(nextStick.startPosition);
    setOutcome(null);
    setDeadline(Date.now() + timeLimitSeconds * 1000);
    setNow(Date.now());
    setPhase("play");
  }, [timeLimitSeconds]);

  useEffect(() => {
    if (startedReference.current) return;
    startedReference.current = true;
    Promise.resolve(adapter.start())
      .then((started) => begin(started.round, started.stick))
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
            middleScore: scoreOf(errorRateAt(stick, STICK_LENGTH_CM / 2)),
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
  }, [adapter, round, stick]);

  useEffect(() => {
    if (phase !== "play") return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) submit(true);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline, phase, submit]);

  function next() {
    if (!outcome) return;
    if (outcome.finished || !outcome.nextStick) {
      setPhase("final");
      onFinish?.({ rows, totalScore });
      return;
    }
    begin(round + 1, outcome.nextStick);
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
                <th className="stick-game__number" scope="col">가운데를 잘랐다면</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.round}>
                  <td>{row.name}</td>
                  <td className="stick-game__number">{formatPercent(row.errorRate)}</td>
                  <td className="stick-game__number">{row.score.toLocaleString("ko-KR")}</td>
                  <td className="stick-game__number stick-game__muted">{row.middleScore.toLocaleString("ko-KR")}</td>
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
  const showingResult = phase === "result" && outcome;

  return (
    <section aria-label="게임" className="stick-game">
      <div className="stick-game__head">
        <p className="stick-game__round">
          <span className="stick-game__round-number">{round}</span>
          <span className="stick-game__round-of">/ {ROUND_COUNT}</span>
          <span className="stick-game__round-name">{info.name}</span>
        </p>
        <p className="stick-game__running">누적 <strong>{totalScore.toLocaleString("ko-KR")}</strong>점</p>
      </div>
      <p className="stick-game__hint">{info.hint}</p>
      <WeightTable stick={stick} />
      {showingResult ? null : <Timer deadline={deadline} limitSeconds={timeLimitSeconds} now={now} />}
      <StickBoard
        answerPosition={showingResult ? outcome.answerPosition : null}
        locked={phase !== "play"}
        onPositionChange={setPosition}
        onSubmit={() => submit(false)}
        position={showingResult ? outcome.position : position}
        stick={stick}
      />
      {showingResult ? (
        <>
          <CutResult
            comment={commentFor(round, outcome.errorRate, outcome.position, outcome.timedOut)}
            position={outcome.position}
            result={outcome}
            stick={stick}
          />
          <div className="stick-game__actions">
            <Button
              data-ph-capture-attribute-action="stick_next_round"
              onClick={next}
              size="lg"
            >
              {outcome.finished ? "최종 결과 보기" : "다음 막대"}
            </Button>
          </div>
        </>
      ) : (
        <div className="stick-game__controls">
          <button
            aria-label="칼을 왼쪽으로 조금 옮기기"
            className="stick-game__nudge"
            data-ph-capture-attribute-action="stick_knife_nudge"
            disabled={phase !== "play"}
            onClick={() => setPosition((current) => clampPosition(current - NUDGE_CM))}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="칼을 오른쪽으로 조금 옮기기"
            className="stick-game__nudge"
            data-ph-capture-attribute-action="stick_knife_nudge"
            disabled={phase !== "play"}
            onClick={() => setPosition((current) => clampPosition(current + NUDGE_CM))}
            type="button"
          >
            ›
          </button>
          <span className="stick-game__nudge-label">미세 조정</span>
          <Button
            className="stick-game__cut"
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
