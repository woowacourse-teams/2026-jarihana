import { useEffect, useRef, useState } from "react";
import { mountRankedGame } from "./mount-ranked-game.mjs";
import { keyLabel } from "./preferences.mjs";
import { rhythmRankedApi } from "./rankedApi.js";
import { CLAY_STYLE, SPRITE_FRAME, SpriteFrame } from "./SpriteFrame.jsx";
import { STAGES, stageOf } from "./stages.mjs";
import "./rhythm-game.css";
import "./rhythm-clay.css";

const LANE_BUTTONS = [
  ["left", "왼쪽", "←"],
  ["down", "아래", "↓"],
  ["up", "위", "↑"],
  ["right", "오른쪽", "→"]
];

// 랭킹 도전의 판이다. 시작 버튼을 누르면 서버에 시작을 알리고 음악을 튼다. 멈추는 버튼은 없다.
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
    <div
      className="rhythm-game rhythm-game--clay rhythm-ranked"
      ref={rootReference}
      style={CLAY_STYLE}
      aria-busy={status === "loading"}
    >
      <div className="rhythm-game__body">
        <div className="game-layout game-layout--ranked">
          <section className="arena-shell" aria-label="랭킹 도전 플레이 화면">
            <div role="application" aria-label="행성이의 리듬 작살 랭킹 도전 입력">
              <canvas
                id="arena"
                data-ph-capture-attribute-action="rhythm_challenge_arena_focus"
                width="900"
                height="900"
                tabIndex="0"
                aria-label="랭킹 도전. 세균 중심이 굵은 판정선에 닿을 때 같은 방향을 눌러요. Esc를 누르면 도전이 무효가 돼요."
              >
                브라우저의 Canvas 지원이 필요해요.
              </canvas>
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
                <span className="eyebrow">RECORD / {STAGES[stageOf(session.level)].bpmLabel}</span>
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

          {/* 혼자 연습(RhythmHarpoonGame)과 같이 점수, 콤보, 라이프, 루프를 판 밖 카드에 둔다. */}
          <div className="rhythm-hud">
            <div className="rhythm-hud__card rhythm-hud__score">
              <span className="eyebrow">점수</span>
              <strong id="score">0</strong>
            </div>
            <div className="rhythm-hud__card rhythm-hud__combo">
              <SpriteFrame className="rhythm-hud__burst" frame={SPRITE_FRAME.burst} />
              <strong id="combo">0</strong>
              <span className="rhythm-hud__tag">COMBO</span>
            </div>
            <div className="rhythm-hud__card rhythm-hud__lives">
              <span className="eyebrow">라이프</span>
              <span id="lives" aria-label="라이프"></span>
            </div>
            <div className="rhythm-hud__card rhythm-hud__stage">
              <span id="loop-info">LOOP 01 / 곡 ×1.00</span>
              <span>랭킹 도전 / 멈출 수 없어요</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
