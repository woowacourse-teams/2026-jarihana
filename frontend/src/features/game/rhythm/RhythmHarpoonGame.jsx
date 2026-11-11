import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "./HeartIcon.jsx";
import { KeyBindings } from "./KeyBindings.jsx";
import { browserStorage } from "./lesson.mjs";
import { mountPracticeGame } from "./mount-practice-game.mjs";
import { SPRITE_ATLAS } from "./sprite-atlas.mjs";
import { SyncDialog } from "./SyncDialog.jsx";
import { keyLabel, readKeymap, writeKeymap } from "./preferences.mjs";
import "./rhythm-game.css";
import "./rhythm-clay.css";

export const RHYTHM_SETTINGS_ID = "rhythm-settings";

// 클레이 스프라이트 시트(SPRITE_ATLAS)의 프레임 번호. 난이도 버튼마다 세균 하나를 붙이고,
// Hardest는 화난 행성이, 스윙 곡의 ANOTHER는 초록 세균으로 구분한다.
const SPRITE_FRAME = { angryPlanet: 1, red: 4, blue: 5, yellow: 6, green: 7, burst: 13 };
const LEVEL_SPRITE = {
  easy: SPRITE_FRAME.red,
  medium: SPRITE_FRAME.blue,
  hard: SPRITE_FRAME.yellow,
  hardest: SPRITE_FRAME.angryPlanet,
  anotherHard: SPRITE_FRAME.green,
  anotherHardest: SPRITE_FRAME.green
};

// 스프라이트 시트에서 프레임 하나만 잘라 보여 주는 장식 그림이다.
function SpriteFrame({ className, frame }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox={SPRITE_ATLAS.frames[frame].join(" ")}
    >
      <image href={SPRITE_ATLAS.url} width={SPRITE_ATLAS.width} height={SPRITE_ATLAS.height} />
    </svg>
  );
}

// 하트는 CSS에서 같은 스프라이트 시트를 배경으로 잘라 쓴다. 시트 주소는 public 경로라 변수로 넘긴다.
const CLAY_STYLE = { "--rhythm-sprite-sheet": `url("${SPRITE_ATLAS.url}")` };

export function RhythmHarpoonGame({ settingsOpen = true, onPlayingChange }) {
  const rootReference = useRef(null);
  const playingReference = useRef(onPlayingChange);
  const [status, setStatus] = useState("loading");
  const [keymap, setKeymap] = useState(() => readKeymap(browserStorage()));
  const keymapReference = useRef(keymap);
  const capturingReference = useRef(false);
  useEffect(() => {
    playingReference.current = onPlayingChange;
  }, [onPlayingChange]);
  useEffect(() => {
    keymapReference.current = keymap;
  }, [keymap]);
  useEffect(() => {
    return mountPracticeGame({
      root: rootReference.current,
      onReady: () => setStatus("ready"),
      onError: () => setStatus("error"),
      onPlayingChange: (playing, reason) => playingReference.current?.(playing, reason),
      keyBindings: {
        get: () => keymapReference.current,
        capturing: () => capturingReference.current
      }
    });
  }, []);

  function changeKeymap(next) {
    setKeymap(next);
    writeKeymap(browserStorage(), next);
  }

  const keyHint = [
    [keymap.left, "왼쪽"],
    [keymap.down, "아래"],
    [keymap.up, "위"],
    [keymap.right, "오른쪽"],
    [keymap.retry, "다시 하기"]
  ]
    .map(([code, label]) => keyLabel(code) + " " + label)
    .join(" / ");
  return (
    <div
      className="rhythm-game rhythm-game--clay"
      ref={rootReference}
      style={CLAY_STYLE}
      aria-busy={status === "loading"}
    >
      <div className="rhythm-game__body">
        <div className="game-layout game-layout--levels">
          <div className="rhythm-levels">
            <span className="eyebrow">난이도</span>
            <div id="difficulty" className="difficulty" role="group" aria-label="난이도">
              <button
                type="button"
                data-level="easy"
                data-ph-capture-attribute-action="rhythm_difficulty_easy"
                aria-pressed="true"
              >
                <SpriteFrame className="level-sprite" frame={LEVEL_SPRITE.easy} />
                <span className="level-name">Easy</span>
                <small className="life-badge">
                  <HeartIcon />
                  <span className="sr-only">라이프</span>10
                </small>
              </button>
              <button
                type="button"
                data-level="medium"
                data-ph-capture-attribute-action="rhythm_difficulty_medium"
                aria-pressed="false"
              >
                <SpriteFrame className="level-sprite" frame={LEVEL_SPRITE.medium} />
                <span className="level-name">Medium</span>
                <small className="life-badge">
                  <HeartIcon />
                  <span className="sr-only">라이프</span>8
                </small>
              </button>
              <button
                type="button"
                data-level="hard"
                data-ph-capture-attribute-action="rhythm_difficulty_hard"
                aria-pressed="false"
              >
                <SpriteFrame className="level-sprite" frame={LEVEL_SPRITE.hard} />
                <span className="level-name">Hard</span>
                <small className="life-badge">
                  <HeartIcon />
                  <span className="sr-only">라이프</span>8
                </small>
              </button>
              <button
                type="button"
                data-level="hardest"
                data-ph-capture-attribute-action="rhythm_difficulty_hardest"
                aria-pressed="false"
              >
                <SpriteFrame className="level-sprite" frame={LEVEL_SPRITE.hardest} />
                <span className="level-name">Hardest</span>
                <small className="life-badge">
                  <HeartIcon />
                  <span className="sr-only">라이프</span>10
                </small>
              </button>
              <button
                type="button"
                data-level="anotherHard"
                data-ph-capture-attribute-action="rhythm_difficulty_another_hard"
                aria-pressed="false"
              >
                <SpriteFrame className="level-sprite" frame={LEVEL_SPRITE.anotherHard} />
                <span className="level-name">ANOTHER Hard</span>
                <small className="life-badge">
                  <HeartIcon />
                  <span className="sr-only">라이프</span>10
                </small>
              </button>
              <button
                type="button"
                data-level="anotherHardest"
                data-ph-capture-attribute-action="rhythm_difficulty_another_hardest"
                aria-pressed="false"
              >
                <SpriteFrame className="level-sprite" frame={LEVEL_SPRITE.anotherHardest} />
                <span className="level-name">ANOTHER Hardest</span>
                <small className="life-badge">
                  <HeartIcon />
                  <span className="sr-only">라이프</span>10
                </small>
              </button>
            </div>
            <p id="difficulty-copy" className="small muted">
              정박 위주의 단타로 리듬을 익혀요.
            </p>
          </div>
          <section className="arena-shell" aria-label="플레이 화면">
            <div role="application" aria-label="행성이의 리듬 작살 게임 입력">
              <canvas
                id="arena"
                data-ph-capture-attribute-action="rhythm_arena_focus"
                width="900"
                height="900"
                tabIndex="0"
                aria-label={`리듬게임. 세균 중심이 굵은 판정선에 닿을 때 화살표 또는 설정한 키로 포획, Esc로 일시정지, ${keyLabel(keymap.retry)}로 처음부터 다시`}
              >
                브라우저의 Canvas 지원이 필요해요.
              </canvas>
            </div>
            <div className="touch-controls" aria-label="터치 방향키">
              <button
                type="button"
                data-lane="left"
                data-ph-capture-attribute-action="rhythm_input_left"
                aria-label="왼쪽"
              >
                ←
              </button>
              <button
                type="button"
                data-lane="down"
                data-ph-capture-attribute-action="rhythm_input_down"
                aria-label="아래"
              >
                ↓
              </button>
              <button
                type="button"
                data-lane="up"
                data-ph-capture-attribute-action="rhythm_input_up"
                aria-label="위"
              >
                ↑
              </button>
              <button
                type="button"
                data-lane="right"
                data-ph-capture-attribute-action="rhythm_input_right"
                aria-label="오른쪽"
              >
                →
              </button>
            </div>
            <div id="overlay" className="overlay">
              <div className="overlay-card">
                <span id="overlay-kicker" className="eyebrow">
                  ARROWS + WASD / 128 BPM
                </span>
                <h2 id="overlay-title">행성이를 지켜줘!</h2>
                <p id="overlay-copy">
                  세균의 중심이 굵은 판정선에 닿을 때<br />
                  화살표 또는 WASD로 같은 방향을 눌러요.
                </p>
                <div id="game-instructions">
                  <div className="key-row" aria-hidden="true">
                    <kbd>←</kbd>
                    <kbd>↓</kbd>
                    <kbd>↑</kbd>
                    <kbd>→</kbd>
                  </div>
                  <p className="small muted">{keyHint}</p>
                </div>
                <div id="run-result" hidden>
                  <p className="result-score">
                    <svg
                      className="result-mascot"
                      viewBox={SPRITE_ATLAS.frames[3].join(" ")}
                      aria-hidden="true"
                      focusable="false"
                    >
                      <image
                        href={SPRITE_ATLAS.url}
                        width={SPRITE_ATLAS.width}
                        height={SPRITE_ATLAS.height}
                      />
                    </svg>
                    <small>연습 점수</small>
                    <strong id="result-score">0</strong>
                  </p>
                  <table className="result-table">
                    <caption className="sr-only">연습 플레이 결과</caption>
                    <thead>
                      <tr>
                        <th scope="row">
                          MAX COMBO<span className="sr-only">최고 콤보</span>
                        </th>
                        <td id="result-combo">0</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="result-judgment result-judgment--perfect">
                        <th scope="row">
                          <span>PERFECT</span>
                        </th>
                        <td id="result-perfect">0</td>
                      </tr>
                      <tr className="result-judgment result-judgment--hit">
                        <th scope="row">
                          <span>HIT</span>
                        </th>
                        <td id="result-hit">0</td>
                      </tr>
                      <tr className="result-judgment result-judgment--enough">
                        <th scope="row">
                          <span>ENOUGH</span>
                        </th>
                        <td id="result-enough">0</td>
                      </tr>
                      <tr className="result-judgment result-judgment--uhoh">
                        <th scope="row">
                          <span>Uh oh</span>
                        </th>
                        <td id="result-uhoh">0</td>
                      </tr>
                      <tr>
                        <th scope="row">
                          <span>놓친 세균</span>
                        </th>
                        <td id="result-miss">0</td>
                      </tr>
                      <tr>
                        <th scope="row">
                          <span>헛공격</span>
                        </th>
                        <td id="result-poor">0</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">
                          LOOP<span className="sr-only">도달 루프</span>
                        </th>
                        <td id="result-loop">0</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button
                  id="start"
                  data-ph-capture-attribute-action="rhythm_start"
                  className="button primary"
                  type="button"
                  disabled
                >
                  음악 준비 중
                </button>
                <p id="load-status" className="small muted" role="status">
                  음악과 스프라이트를 불러오고 있어요.
                </p>
              </div>
            </div>
            <p id="announcer" className="sr-only" aria-live="polite"></p>
          </section>

          {/* 점수, 콤보, 라이프, 진행은 판을 가리지 않도록 판 오른쪽(좁은 화면에서는 판 위)의 카드에 둔다. */}
          <div className="rhythm-hud">
            <div className="rhythm-hud__card rhythm-hud__score">
              <span className="eyebrow">연습 점수</span>
              <strong id="score">0</strong>
            </div>
            <div className="rhythm-hud__card rhythm-hud__combo">
              <SpriteFrame className="rhythm-hud__burst" frame={SPRITE_FRAME.burst} />
              <strong id="combo">0</strong>
              <span className="rhythm-hud__tag">COMBO</span>
            </div>
            <div className="rhythm-hud__card rhythm-hud__lives">
              <span className="eyebrow">라이프</span>
              <span id="lives" aria-label="라이프 10개"></span>
            </div>
            <div className="rhythm-hud__card rhythm-hud__stage">
              <span id="loop-info">LOOP 01 / 곡 ×1.00</span>
              <span id="position">준비 중</span>
            </div>
          </div>

          <aside
            className={settingsOpen ? "controls rhythm-drawer is-open" : "controls rhythm-drawer"}
            id={RHYTHM_SETTINGS_ID}
            aria-label="연습 설정"
          >
            <p className="practice-notice" role="note">
              연습 플레이예요. 점수는 저장되거나 랭킹에 반영되지 않아요.
            </p>
            <header className="masthead">
              <div className="track">
                <span className="eyebrow">NOW PLAYING</span>
                <span id="track-title">Pixel Circuit</span>
                <small id="track-meta">128 BPM / 90초 루프</small>
              </div>
              <button
                id="pause"
                data-ph-capture-attribute-action="rhythm_pause"
                className="button subtle"
                type="button"
                disabled
              >
                일시정지
              </button>
            </header>
            <p className="small muted">
              플레이 중에도 난이도와 설정을 바꿀 수 있어요. 변경하면 곡의 처음부터 새로 시작해요.
            </p>

            <section className="control-section audio-controls">
              <label htmlFor="rate">세균 이동 배속</label>
              <select
                defaultValue="1"
                id="rate"
                data-ph-capture-attribute-action="rhythm_scroll_speed_change"
              >
                <option value="1">×1.0</option>
                <option value="1.25">×1.25</option>
                <option value="1.5">×1.5</option>
                <option value="1.75">×1.75</option>
                <option value="2">×2.0</option>
                <option value="2.25">×2.25</option>
                <option value="2.5">×2.5</option>
                <option value="2.75">×2.75</option>
                <option value="3">×3.0</option>
              </select>
              <p className="small muted">
                배속을 올리면 세균이 빠르게 이동하고 서로의 간격이 넓어져요.
              </p>
            </section>

            <section className="control-section">
              <span className="eyebrow">NOTE COLORS</span>
              <div className="note-legend">
                <span>
                  <i className="dot red"></i>쿵 / 정박
                </span>
                <span>
                  <i className="dot blue"></i>착 / 8분 엇박
                </span>
                <span>
                  <i className="dot yellow"></i>치 / 16분
                </span>
                <span id="legend-triplet" hidden>
                  <i className="dot green"></i>따 / 셋잇단, 스윙 엇박
                </span>
              </div>
              <label className="check">
                <input
                  id="note-labels"
                  data-ph-capture-attribute-action="rhythm_labels_toggle"
                  type="checkbox"
                  defaultChecked
                />
                세균 위 소리 글자 표시
              </label>
              <p className="small muted">
                같은 색은 같은 박 위치예요.
                <br />
                회색 선으로 이어진 세균은 동시에 잡아요.
                <br />
                오른쪽 위 세균이 시작 노트, 곡선 화살표가 회전 방향이에요.
                <br />
                작은 주황 화살표가 2박 전부터 다음 반전을 예고해요.
                <br />
                판정선이 1-2-3-4 박자에 맞춰 울려요.
              </p>
            </section>

            <section className="control-section judgment">
              <div>
                <b>PERFECT</b>
                <span>
                  ±32ms <em>+1,000</em>
                </span>
              </div>
              <div>
                <b>HIT</b>
                <span>
                  ±64ms <em>+600</em>
                </span>
              </div>
              <div>
                <b>ENOUGH</b>
                <span>
                  빠름 120ms, 늦음 100ms <em>+300</em>
                </span>
              </div>
              <div>
                <b>Uh oh</b>
                <span>
                  빠름 200ms, 늦음 150ms <em>놓침</em>
                </span>
              </div>
              <div>
                <b>헛공격</b>
                <span>
                  빠름 200ms, 늦음 150ms 밖 <em>-300</em>
                </span>
              </div>
              <p className="small muted">
                세균이 판정선에 왔을 때 해당 방향을 눌러요. 헛공격하면 300점이 깎이지만 콤보와
                라이프는 그대로예요.
              </p>
              <p className="small muted">
                빠르게 누르면 120ms, 늦게 누르면 100ms까지 포획돼요. 그보다 벗어나 빠르면 200ms, 늦으면
                150ms까지는 Uh oh로 세균을 놓치고 콤보가 끊겨요. 그보다 더 벗어난 입력은 헛공격이에요.
                <br />
                포획 시기를 놓치면 세균이 돌진해요.
              </p>
              <label className="check">
                <input
                  id="timing-feedback"
                  data-ph-capture-attribute-action="rhythm_timing_feedback_toggle"
                  type="checkbox"
                  defaultChecked
                />
                FAST/SLOW 표시
              </label>
              <p className="small muted">FAST는 빠르게, SLOW는 늦게 눌렀다는 뜻이에요.</p>
            </section>

            <section className="control-section audio-controls">
              <label htmlFor="volume">
                음량 <output id="volume-value">65%</output>
              </label>
              <input
                id="volume"
                data-ph-capture-attribute-action="rhythm_volume_change"
                type="range"
                min="0"
                max="100"
                defaultValue="65"
              />
              <label htmlFor="offset">
                입력 지연 보정 <output id="offset-value">0ms</output>
              </label>
              <input
                id="offset"
                data-ph-capture-attribute-action="rhythm_offset_change"
                type="range"
                min="-150"
                max="150"
                step="1"
                defaultValue="0"
              />
              <p className="small muted" id="offset-hint">
                SLOW가 많이 나면 <code className="offset-sign">+</code>로, FAST가 많이 나면{" "}
                <code className="offset-sign">-</code>로 옮겨요. 보정값은 이 브라우저에 저장돼요.
              </p>
              <button
                id="sync-open"
                data-ph-capture-attribute-action="rhythm_sync_open"
                className="button subtle"
                type="button"
                disabled
              >
                싱크 진단 / 보정
              </button>
            </section>
            <KeyBindings
              keymap={keymap}
              onCapturingChange={(capturing) => {
                capturingReference.current = capturing;
              }}
              onChange={changeKeymap}
            />
            <button
              id="restart"
              data-ph-capture-attribute-action="rhythm_restart"
              className="button subtle"
              type="button"
              disabled
            >
              같은 설정으로 다시 ({keyLabel(keymap.retry)})
            </button>
          </aside>
        </div>

        <footer>
          <span id="speed-up-copy">2루프부터 곡 배속이 매 루프 +0.05 / 음높이도 함께 상승</span>
          <span>매 루프 방향 랜덤 / 계단은 진행 방향을 유지하고 시작점만 회전</span>
        </footer>
      </div>
      <SyncDialog />

      {status === "error" ? (
        <p className="rhythm-game-error" role="alert">
          게임을 불러오지 못했어요. 위의 다시 불러오기를 눌러 주세요.
        </p>
      ) : null}
    </div>
  );
}
