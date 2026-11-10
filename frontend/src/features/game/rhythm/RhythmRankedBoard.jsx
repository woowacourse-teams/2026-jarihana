import { useEffect, useRef, useState } from "react";
import { mountRankedGame } from "./mount-ranked-game.mjs";
import { keyLabel } from "./preferences.mjs";
import { rhythmRankedApi } from "./rankedApi.js";
import "./rhythm-game.css";

const LANE_BUTTONS = [
  ["left", "왼쪽", "←"],
  ["down", "아래", "↓"],
  ["up", "위", "↑"],
  ["right", "오른쪽", "→"]
];

// 공식 도전의 판이다. 시작 버튼을 누르면 서버에 시작을 알리고 음악을 튼다. 멈추는 버튼은 없다.
export function RhythmRankedBoard({ session, settings, onFinished, onInvalid, onError }) {
  const rootReference = useRef(null);
  const callbacks = useRef({ onFinished, onInvalid, onError });
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    callbacks.current = { onFinished, onInvalid, onError };
  }, [onFinished, onInvalid, onError]);
  useEffect(
    () =>
      mountRankedGame({
        root: rootReference.current,
        session,
        api: rhythmRankedApi,
        keymap: settings.keymap,
        offsetMs: settings.offset,
        volume: settings.volume,
        showTiming: settings.timingFeedback,
        showLabels: settings.labels,
        onReady: () => setStatus("ready"),
        onRunning: () => setStatus("running"),
        onFinished: (state) => callbacks.current.onFinished(state),
        onInvalid: (reason) => callbacks.current.onInvalid(reason),
        onError: (error) => callbacks.current.onError(error)
      }),
    [session, settings]
  );
  const keys = [settings.keymap.left, settings.keymap.down, settings.keymap.up, settings.keymap.right]
    .map(keyLabel)
    .join(" ");
  return (
    <div className="rhythm-game rhythm-ranked" ref={rootReference} aria-busy={status === "loading"}>
      <div className="rhythm-game__body">
        <div className="game-layout">
          <section className="arena-shell" aria-label="공식 도전 플레이 화면">
            <div className="hud">
              <div>
                <span className="eyebrow">점수</span>
                <strong id="score">0</strong>
              </div>
              <div className="combo-stat">
                <span className="eyebrow">COMBO</span>
                <strong id="combo">0</strong>
              </div>
              <div className="life-stat">
                <span className="eyebrow">LIFE</span>
                <span id="lives" aria-label="라이프"></span>
              </div>
            </div>
            <div role="application" aria-label="행성이의 리듬 작살 공식 도전 입력">
              <canvas
                id="arena"
                data-ph-capture-attribute-action="rhythm_challenge_arena_focus"
                width="900"
                height="900"
                tabIndex="0"
                aria-label="공식 도전. 세균 중심이 굵은 판정선에 닿을 때 같은 방향을 눌러요. Esc를 누르면 도전이 무효가 돼요."
              >
                브라우저의 Canvas 지원이 필요해요.
              </canvas>
            </div>
            <div className="stage-strip">
              <span>공식 도전 / 멈출 수 없어요</span>
              <span id="loop-info">LOOP 01 / 곡 ×1.00</span>
            </div>
            <div className="touch-controls" aria-label="터치 방향키">
              {LANE_BUTTONS.map(([lane, label, arrow]) => (
                <button
                  aria-label={label}
                  data-ph-capture-attribute-action={"rhythm_challenge_input_" + lane}
                  data-ranked-lane={lane}
                  key={lane}
                  type="button"
                >
                  {arrow}
                </button>
              ))}
            </div>
            <div id="overlay" className="overlay">
              <div className="overlay-card">
                <span className="eyebrow">RECORD / 128 BPM</span>
                <h2>준비되면 시작해요</h2>
                <p>
                  시작하면 멈출 수 없어요.
                  <br />
                  Esc를 누르거나 다른 창으로 옮기면 이번 도전은 무효예요.
                </p>
                <div className="key-row" aria-hidden="true">
                  <kbd>←</kbd>
                  <kbd>↓</kbd>
                  <kbd>↑</kbd>
                  <kbd>→</kbd>
                </div>
                <p className="small muted">방향키 또는 {keys}</p>
                <button
                  id="start"
                  data-ph-capture-attribute-action="rhythm_challenge_play"
                  className="button primary"
                  type="button"
                  disabled={status !== "ready"}
                >
                  {status === "loading" ? "음악 준비 중" : "시작"}
                </button>
              </div>
            </div>
            <p id="announcer" className="sr-only" aria-live="polite"></p>
          </section>
        </div>
      </div>
    </div>
  );
}
