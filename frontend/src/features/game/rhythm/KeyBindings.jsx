import { useState } from "react";

import { DEFAULT_KEYMAP, KEY_ACTIONS, assignKey, keyLabel } from "./preferences.mjs";

// 받침 유무로 조사를 고른다. 받침이 없거나 한글이 아니면 뒤쪽 조사를 쓴다.
function particle(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code < 11172 && code % 28 ? withFinal : withoutFinal);
}

export function KeyBindings({ keymap, onChange, onCapturingChange }) {
  const [capturing, setCapturing] = useState(null);
  const [message, setMessage] = useState("");

  function startCapture(actionId) {
    setCapturing(actionId);
    onCapturingChange(true);
    setMessage("");
  }

  function stopCapture() {
    setCapturing(null);
    onCapturingChange(false);
  }

  function handleKeyDown(event, action) {
    if (capturing !== action.id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      stopCapture();
      setMessage("키 바꾸기를 취소했어요.");
      return;
    }
    const result = assignKey(keymap, action.id, event.code);
    if (!result) {
      setMessage("글자, 숫자, 기호 키만 쓸 수 있어요. 다른 키를 눌러 주세요.");
      return;
    }
    onChange(result.keymap);
    stopCapture();
    const swapped = KEY_ACTIONS.find((item) => item.id === result.swappedWith);
    setMessage(
      swapped
        ? `${keyLabel(event.code)} 키를 ${action.label}에 두고, ${particle(swapped.label, "은", "는")} ${keyLabel(result.keymap[swapped.id])} 키로 바꿨어요.`
        : `${particle(action.label, "을", "를")} ${keyLabel(event.code)} 키로 바꿨어요.`
    );
  }

  return (
    <section className="control-section key-bindings" aria-labelledby="key-bindings-title">
      <span className="eyebrow" id="key-bindings-title">
        KEYS
      </span>
      <p className="small muted">방향키는 항상 쓸 수 있어요. 바꾸기를 누른 뒤 원하는 키를 누르세요.</p>
      <div className="key-bindings__list">
        {KEY_ACTIONS.map((action) => (
          <div className="key-binding" key={action.id}>
            <span>{action.label}</span>
            {action.arrow ? <kbd aria-hidden="true">{action.arrow}</kbd> : <span aria-hidden="true" />}
            <button
              aria-label={`${action.label} 키 바꾸기, 지금 ${keyLabel(keymap[action.id])}`}
              aria-pressed={capturing === action.id}
              className="key-binding__button"
              data-ph-capture-attribute-action={`rhythm_key_bind_${action.id}`}
              onBlur={() => {
                if (capturing === action.id) stopCapture();
              }}
              onClick={() => startCapture(action.id)}
              onKeyDown={(event) => handleKeyDown(event, action)}
              type="button"
            >
              {capturing === action.id ? "키를 누르세요" : keyLabel(keymap[action.id])}
            </button>
          </div>
        ))}
      </div>
      <button
        className="button subtle"
        data-ph-capture-attribute-action="rhythm_key_reset"
        onClick={() => {
          onChange({ ...DEFAULT_KEYMAP });
          stopCapture();
          setMessage("기본 키(W, A, S, D, R)로 되돌렸어요.");
        }}
        type="button"
      >
        기본 키로 되돌리기
      </button>
      <p className="small muted" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
