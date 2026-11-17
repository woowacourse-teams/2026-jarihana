import { useEffect, useMemo, useRef, useState } from "react";
import { keyLabel } from "../preferences.mjs";
import { CLAY_STYLE } from "../SpriteFrame.jsx";
import { fromServerLevel, rhythmBattleApi } from "./battleApi";
import { mountBattleGame } from "./mount-battle-game.mjs";
import "../rhythm-game.css";
import "../rhythm-clay.css";
import "./rhythm-battle.css";

const LANE_BUTTONS = [
  ["left", "왼쪽", "←"],
  ["down", "아래", "↓"],
  ["up", "위", "↑"],
  ["right", "오른쪽", "→"]
];

// 대전 한 판의 화면이다. 왼쪽(좁은 화면에서는 아래)에 내 판, 오른쪽(위)에 상대 판을 둔다.
// 상대 판은 실시간 연결로 받은 입력을 같은 시드로 다시 그리므로 조금 늦게 보인다.
// 판이 끝나면(방이 PLAYING이 아니면) 판을 멈추고, 승패는 방 화면이 보여 준다.
export function RhythmBattleBoard({ room, memberId, batches, settings, serverOffset, onOut, onError }) {
  const rootReference = useRef(null);
  const controller = useRef(null);
  const callbacks = useRef({ onOut, onError });
  const [status, setStatus] = useState("loading");
  const me = room.host.memberId === memberId ? room.host : room.guest;
  const rival = room.host.memberId === memberId ? room.guest : room.host;
  const myRun = room.runs.find((run) => run.memberId === memberId);
  const rivalRun = room.runs.find((run) => run.memberId === rival.memberId);
  // 방 화면이 판마다 이 화면을 새로 띄우므로(key), 판을 시작할 때의 값을 한 번만 정한다.
  const [game] = useState(() => ({
    roomId: room.id,
    gameNumber: room.gameNumber,
    level: fromServerLevel(room.level),
    seed: room.seed,
    startsAt: room.startsAt,
    chartVersion: room.chartVersion,
    myScrollSpeed: myRun?.scrollSpeed ?? me.scrollSpeed,
    rivalScrollSpeed: rivalRun?.scrollSpeed ?? rival.scrollSpeed
  }));

  useEffect(() => {
    callbacks.current = { onOut, onError };
  }, [onOut, onError]);

  useEffect(() => {
    controller.current = mountBattleGame({
      root: rootReference.current,
      game,
      api: rhythmBattleApi,
      keymap: settings.keymap,
      offsetMs: settings.offset,
      volume: settings.volume,
      showTiming: settings.timingFeedback,
      showLabels: settings.labels,
      serverOffset: () => serverOffset.current,
      onReady: () => setStatus("ready"),
      onRunning: () => setStatus("running"),
      onOut: (result) => {
        setStatus("out");
        callbacks.current.onOut(result);
      },
      onError: (error) => callbacks.current.onError(error)
    });
    return () => controller.current?.dispose();
    // 한 판마다 한 번만 띄운다. 설정은 판을 시작할 때의 값을 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const rivalBatches = useMemo(
    () =>
      batches.gameNumber === room.gameNumber
        ? batches.items.filter((batch) => batch.memberId === rival.memberId)
        : [],
    [batches, room.gameNumber, rival.memberId]
  );
  useEffect(() => {
    if (rivalBatches.length) controller.current?.receiveRival(rivalBatches);
  }, [rivalBatches]);

  const finished = room.status !== "PLAYING";
  useEffect(() => {
    if (finished) controller.current?.end();
  }, [finished]);

  const keys = [settings.keymap.left, settings.keymap.down, settings.keymap.up, settings.keymap.right]
    .map(keyLabel)
    .join(" ");
  return (
    <div
      className="rhythm-game rhythm-game--clay rhythm-battle"
      ref={rootReference}
      style={CLAY_STYLE}
      aria-busy={status === "loading"}
    >
      <div className="rhythm-battle__boards">
        <section className="rhythm-battle__side rhythm-battle__side--me" aria-label={"내 판, " + me.name}>
          <header className="rhythm-battle__player">
            <strong>{me.name}</strong>
            <span className="rhythm-battle__tag">나</span>
          </header>
          <div className="rhythm-battle__arena">
            <div role="application" aria-label="행성이의 리듬 작살 대전 입력">
              <canvas
                id="arena"
                data-ph-capture-attribute-action="rhythm_battle_arena_focus"
                height="900"
                tabIndex="0"
                width="900"
                aria-label="내 판. 세균 중심이 굵은 판정선에 닿을 때 같은 방향을 눌러요. Esc를 누르면 기권해요."
              >
                브라우저의 Canvas 지원이 필요해요.
              </canvas>
            </div>
            <div id="battle-countdown" className="rhythm-battle__countdown" aria-hidden="true" hidden></div>
            <button
              className="ui-button ui-button--primary ui-button--md rhythm-battle__audio"
              data-ph-capture-attribute-action="rhythm_battle_audio_unlock"
              hidden
              id="battle-audio"
              type="button"
            >
              눌러서 소리 켜기
            </button>
            {status === "loading" ? <p className="rhythm-battle__loading">음악을 준비하고 있어요.</p> : null}
            {myRun?.status === "OUT" || status === "out" ? (
              <p className="rhythm-battle__out">탈락</p>
            ) : null}
          </div>
          <div className="rhythm-battle__hud">
            <span>
              <span className="eyebrow">점수</span>
              <strong id="score">0</strong>
            </span>
            <span>
              <span className="eyebrow">COMBO</span>
              <strong id="combo">0</strong>
            </span>
            <span id="lives" className="rhythm-battle__lives" aria-label="라이프"></span>
          </div>
          <div className="touch-controls" aria-label="터치 방향키">
            {LANE_BUTTONS.map(([lane, label, arrow]) => (
              <button
                aria-label={label}
                data-battle-lane={lane}
                data-ph-capture-attribute-action={"rhythm_battle_input_" + lane}
                key={lane}
                type="button"
              >
                {arrow}
              </button>
            ))}
          </div>
          <p className="small muted rhythm-battle__keys">방향키 또는 {keys} / Esc는 기권</p>
        </section>

        <section className="rhythm-battle__side rhythm-battle__side--rival" aria-label={"상대 판, " + rival.name}>
          <header className="rhythm-battle__player">
            <strong>{rival.name}</strong>
            <span className="rhythm-battle__tag rhythm-battle__tag--rival">상대</span>
          </header>
          <div className="rhythm-battle__arena">
            <canvas id="rival-arena" height="900" width="900" aria-hidden="true"></canvas>
            {rivalRun?.status === "OUT" ? <p className="rhythm-battle__out">탈락</p> : null}
          </div>
          <div className="rhythm-battle__hud">
            <span>
              <span className="eyebrow">점수</span>
              <strong id="rival-score">0</strong>
            </span>
            <span>
              <span className="eyebrow">COMBO</span>
              <strong id="rival-combo">0</strong>
            </span>
            <span id="rival-lives" className="rhythm-battle__lives" aria-label="상대 라이프"></span>
          </div>
        </section>
      </div>
      <p id="announcer" className="sr-only" aria-live="polite"></p>
    </div>
  );
}
