import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "./HeartIcon.jsx";
import { KeyBindings } from "./KeyBindings.jsx";
import { browserStorage } from "./lesson.mjs";
import { mountPracticeGame } from "./mount-practice-game.mjs";
import { keyLabel, readKeymap, writeKeymap } from "./preferences.mjs";
import "./rhythm-game.css";

export const RHYTHM_SETTINGS_ID = "rhythm-settings";

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
      onPlayingChange: (playing) => playingReference.current?.(playing),
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
      className="rhythm-game"
      ref={rootReference}
      aria-busy={status === "loading"}
    >
      <div className="rhythm-game__body">
        <div className="game-layout game-layout--levels">
          <div className="rhythm-levels">
            <span className="eyebrow">DIFFICULTY</span>
            <div id="difficulty" className="difficulty" role="group" aria-label="난이도">
              <button
                type="button"
                data-level="easy"
                data-ph-capture-attribute-action="rhythm_difficulty_easy"
                aria-pressed="true"
              >
                Easy<small className="life-badge">
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
                Medium<small className="life-badge">
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
                Hard<small className="life-badge">
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
                Hardest<small className="life-badge">
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
            <div className="hud">
              <div>
                <span className="eyebrow">연습 점수</span>
                <strong id="score">0</strong>
              </div>
              <div className="combo-stat">
                <span className="eyebrow">COMBO</span>
                <strong id="combo">0</strong>
              </div>
              <div className="life-stat">
                <span className="eyebrow">LIFE</span>
                <span id="lives" aria-label="라이프 10개"></span>
              </div>
            </div>
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
            <div className="stage-strip">
              <span id="position">준비 중</span>
              <span id="loop-info">LOOP 01 / 곡 ×1.00</span>
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
                      viewBox="953 68 255 256"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <image
                        href="/game-assets/rhythm-harpoon/assets/sprites.png"
                        width="1280"
                        height="1280"
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
                <span>Pixel Circuit</span>
                <small>128 BPM / 90초 루프</small>
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
                  ±100ms <em>+300</em>
                </span>
              </div>
              <div>
                <b>Uh oh</b>
                <span>
                  ±150ms <em>+100</em>
                </span>
              </div>
              <div>
                <b>헛공격</b>
                <span>
                  200ms 이상 <em>-1,000</em>
                </span>
              </div>
              <p className="small muted">
                세균이 판정선에 왔을 때 해당 방향을 눌러요. 헛공격하면 1,000점이 깎여요.
              </p>
              <p className="small muted">
                ±150ms까지 포획돼요. 150ms 초과~200ms 미만은 입력만 무시해요.
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
          <span>6루프부터 곡 배속이 매 루프 +0.05 / 음높이도 함께 상승</span>
          <span>매 루프 방향 랜덤 / 계단은 진행 방향을 유지하고 시작점만 회전</span>
        </footer>
      </div>
      <dialog
        id="sync-dialog"
        className="sync-dialog"
        aria-labelledby="sync-title"
        aria-describedby="sync-description"
      >
        <div className="sync-heading">
          <span className="eyebrow">SYNC CHECK</span>
          <h2 id="sync-title">소리에 맞춰 싱크 맞추기</h2>
        </div>
        <p id="sync-description">
          클릭음을 4박 들은 뒤, 이어지는 20박에 맞춰 눌러요. 화면의 움직임 대신 소리에만 집중해요.
        </p>
        <p className="small muted">
          기기 지연과 개인의 입력 습관이 함께 반영되는 추천값이에요. 리듬감 점수나 기기 자체의 지연
          측정값은 아니에요.
        </p>
        <div className="sync-volume">
          <label htmlFor="sync-volume">
            진단 음량 <output id="sync-volume-value">50%</output>
          </label>
          <input
            id="sync-volume"
            data-ph-capture-attribute-action="rhythm_sync_volume_change"
            type="range"
            min="0"
            max="100"
            step="5"
            defaultValue="50"
          />
        </div>
        <p className="sync-current">
          현재 보정 <strong id="sync-current">0ms</strong>
        </p>
        <p id="sync-status" className="sync-status" role="status">
          측정 시작을 누르면 클릭음이 나와요.
        </p>
        <button
          id="sync-tap"
          data-ph-capture-attribute-action="rhythm_sync_tap"
          className="sync-tap"
          type="button"
          disabled
        >
          클릭음에 맞춰 누르기<small>Space / 방향키 / WASD / 터치</small>
        </button>
        <div className="sync-progress">
          <progress id="sync-progress" value="0" max="20" aria-label="입력한 박 수"></progress>
          <output id="sync-count">0 / 20</output>
        </div>
        <div id="sync-result" className="sync-result" hidden>
          <dl>
            <div>
              <dt>추천 보정</dt>
              <dd id="sync-recommendation">측정 전</dd>
            </div>
            <div>
              <dt>입력 편차</dt>
              <dd id="sync-spread">측정 전</dd>
            </div>
            <div>
              <dt>반영한 입력</dt>
              <dd id="sync-samples">0 / 20</dd>
            </div>
          </dl>
          <p className="small muted">
            몇 번의 큰 오차는 제외해요. 입력 편차가 크면 다시 측정해요. 이어폰이나 키보드를 바꾸면
            다시 진단하는 게 좋아요.
          </p>
        </div>
        <div className="sync-actions">
          <button
            id="sync-start"
            data-ph-capture-attribute-action="rhythm_sync_start"
            className="button primary"
            type="button"
          >
            측정 시작
          </button>
          <button
            id="sync-apply"
            data-ph-capture-attribute-action="rhythm_sync_apply"
            className="button"
            type="button"
            disabled
          >
            추천값 적용
          </button>
          <button
            id="sync-close"
            data-ph-capture-attribute-action="rhythm_sync_close"
            className="button subtle"
            type="button"
          >
            닫기
          </button>
        </div>
      </dialog>

      {status === "error" ? (
        <p className="rhythm-game-error" role="alert">
          게임을 불러오지 못했어요. 위의 다시 불러오기를 눌러 주세요.
        </p>
      ) : null}
    </div>
  );
}
