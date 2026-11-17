import { useEffect, useRef, useState } from "react";
import { rhythmBattleApi } from "./battleApi";

const MAX_LENGTH = 300;

function newMessageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (Number(digit) ^ (Math.random() * 16) >> (Number(digit) / 4)).toString(16)
  );
}

// 대전 방 채팅이다. 같은 메시지 번호로 다시 보내도 서버가 한 번만 남기므로, 실패하면 같은 번호로 다시 보낸다.
export function RhythmBattleChat({ roomId, memberId, messages, onSent, disabled }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const pendingId = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  async function send(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    pendingId.current ??= newMessageId();
    setSending(true);
    setError(null);
    try {
      const message = await rhythmBattleApi.send(roomId, pendingId.current, text);
      onSent(message);
      pendingId.current = null;
      setBody("");
    } catch {
      setError("메시지를 보내지 못했어요. 다시 보내 주세요.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rhythm-battle-chat" aria-label="방 채팅">
      <ol className="rhythm-battle-chat__list" ref={list}>
        {messages.length === 0 ? <li className="rhythm-battle-chat__empty">아직 대화가 없어요.</li> : null}
        {messages.map((message) => (
          <li className={message.memberId === memberId ? "is-mine" : undefined} key={message.id}>
            <strong>{message.senderName}</strong>
            <span>{message.body}</span>
          </li>
        ))}
      </ol>
      <form className="rhythm-battle-chat__form" onSubmit={send}>
        <label className="sr-only" htmlFor="rhythm-battle-chat-input">
          채팅 입력
        </label>
        <input
          autoComplete="off"
          data-ph-capture-attribute-action="rhythm_battle_chat_input"
          disabled={disabled}
          id="rhythm-battle-chat-input"
          maxLength={MAX_LENGTH}
          onChange={(event) => {
            setBody(event.target.value);
            pendingId.current = null;
          }}
          placeholder="한마디 남기기"
          value={body}
        />
        <button
          className="button"
          data-ph-capture-attribute-action="rhythm_battle_chat_send"
          disabled={disabled || sending || !body.trim()}
          type="submit"
        >
          보내기
        </button>
      </form>
      {error ? (
        <p className="small rhythm-battle-chat__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
