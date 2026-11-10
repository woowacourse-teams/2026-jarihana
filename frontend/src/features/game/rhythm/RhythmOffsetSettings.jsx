import { useEffect, useRef, useState } from "react";
import { SYNC_CONFIG, writeOffset } from "./calibration.mjs";
import { browserStorage } from "./lesson.mjs";
import { SyncCalibrationUI } from "./sync-ui.mjs";
import { SyncDialog } from "./SyncDialog.jsx";

const signed = (value) => (value > 0 ? "+" : "") + value + "ms";

// 화면마다 다른 고정 식별자와 안내 문구다. 저장값은 모두 같은 키를 쓴다.
const PLACES = {
  challenge: {
    inputId: "challenge-offset",
    action: "rhythm_challenge_offset_change",
    unsaved: "현재 값은 이번 도전에 적용돼요. 이 브라우저에는 저장되지 않아요.",
    saved: "이 브라우저에 저장했어요. 연습에도 같은 값이 쓰여요."
  },
  lesson: {
    inputId: "lesson-offset",
    action: "rhythm_lesson_offset_change",
    unsaved: "현재 값은 따라 하기에 적용돼요. 이 브라우저에는 저장되지 않아요.",
    saved: "이 브라우저에 저장했어요. 연습과 공식 도전에도 같은 값이 쓰여요."
  }
};

// 입력 지연 보정을 맞춘다. 연습과 같은 저장값을 쓰고, 연습의 싱크 진단 창을 그대로 연다.
export function RhythmOffsetSettings({ offset, onChange, place = "challenge" }) {
  const copy = PLACES[place];
  const rootReference = useRef(null);
  const offsetReference = useRef(offset);
  const changeReference = useRef(onChange);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    offsetReference.current = offset;
    changeReference.current = onChange;
  }, [offset, onChange]);

  function apply(value) {
    const stored = writeOffset(browserStorage(), value);
    setSaved(stored);
    changeReference.current(value);
    return stored;
  }

  useEffect(() => {
    const root = rootReference.current;
    const lifetime = new AbortController();
    const sync = new SyncCalibrationUI({
      document: { getElementById: (id) => root.querySelector("#" + id) },
      signal: lifetime.signal,
      createContext: () => new AudioContext({ latencyHint: "interactive" }),
      beforeOpen: async () => true,
      getOffset: () => offsetReference.current,
      applyOffset: apply
    });
    let frame = requestAnimationFrame(function loop(stamp) {
      sync.tick(stamp);
      frame = requestAnimationFrame(loop);
    });
    // 진단 창이 열려 있을 때의 방향키와 Space는 클릭음에 맞춘 입력으로 쓴다.
    window.addEventListener(
      "keydown",
      (event) => {
        if (sync.isOpen) sync.handleKey(event);
      },
      { capture: true, signal: lifetime.signal }
    );
    return () => {
      lifetime.abort();
      cancelAnimationFrame(frame);
      sync.cancel();
      const dialog = root.querySelector("#sync-dialog");
      if (dialog?.open) dialog.close();
    };
    // apply는 참조로만 최신 값을 읽으므로 진단 창은 한 번만 붙인다.
  }, []);

  return (
    <div className="control-section audio-controls" ref={rootReference}>
      <label htmlFor={copy.inputId}>
        입력 지연 보정 <output>{signed(offset)}</output>
      </label>
      <input
        data-ph-capture-attribute-action={copy.action}
        id={copy.inputId}
        max={SYNC_CONFIG.maxOffset}
        min={-SYNC_CONFIG.maxOffset}
        onChange={(event) => apply(Number(event.target.value))}
        step="1"
        type="range"
        value={offset}
      />
      <p className="small muted" role="status">
        {saved === false ? copy.unsaved : saved ? copy.saved : null}{" "}
        SLOW가 많이 나면 <code className="offset-sign">+</code>로, FAST가 많이 나면{" "}
        <code className="offset-sign">-</code>로 옮겨요.
      </p>
      <button
        className="button subtle"
        data-ph-capture-attribute-action="rhythm_sync_open"
        id="sync-open"
        type="button"
      >
        싱크 진단 / 보정
      </button>
      <SyncDialog />
    </div>
  );
}
