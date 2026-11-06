import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, MessageCircle } from "lucide-react";
import { Button, Modal } from "../../shared/ui";
import "./gomoku-chat.css";

const mediaQuery = "(max-width: 79.999rem)";
function subscribe(callback) {
  const media = window.matchMedia(mediaQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const compactSnapshot = () => window.matchMedia(mediaQuery).matches;

function isSameMinuteGroup(first, second) {
  return Boolean(
    first?.createdAt &&
      second?.createdAt &&
      first.senderId === second.senderId &&
      first.createdAt.slice(0, 16) === second.createdAt.slice(0, 16)
  );
}

function Conversation({
  chat,
  memberId,
  closed,
  connected,
  draft,
  setDraft,
  compact,
  seconds,
  playing
}) {
  const scroll = useRef(null);
  const atBottom = useRef(true);
  const historyAnchor = useRef(null);
  const [away, setAway] = useState(false);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (historyAnchor.current) {
      if (!chat.historyLoading) {
        const anchor = historyAnchor.current;
        if (anchor.element.isConnected) {
          element.scrollTop +=
            anchor.element.getBoundingClientRect().top -
            element.getBoundingClientRect().top -
            anchor.offset;
        }
        historyAnchor.current = null;
      }
    } else if (atBottom.current) element.scrollTop = element.scrollHeight;
  }, [chat.messages, chat.pending, chat.historyLoading]);

  function latest() {
    historyAnchor.current = null;
    atBottom.current = true;
    setAway(false);
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }
  function send(event) {
    event.preventDefault();
    if (!connected || closed) return;
    if (chat.send(draft)) {
      setDraft("");
      latest();
    }
  }
  const messages = [...chat.messages, ...chat.pending];
  return (
    <section className="gomoku-chat" aria-label="게임방 채팅" data-ph-private>
      {(!compact || (playing && !closed)) && (
        <header className="gomoku-chat__header">
          {!compact && (
            <h2>
              <MessageCircle aria-hidden="true" /> 게임방 대화
            </h2>
          )}
          {compact && playing && !closed && (
            <span className="gomoku-chat__clock" role="timer" aria-label={`남은 시간 ${seconds}초`}>
              {seconds}초 남음
            </span>
          )}
        </header>
      )}
      <div className="gomoku-chat__body">
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The scroll region needs keyboard focus, including Safari. */}
        <div
          ref={scroll}
          className="gomoku-chat__scroll"
          tabIndex={0}
          role="region"
          aria-label="대화 스크롤 영역"
          onScroll={() => {
            const element = scroll.current;
            atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
            setAway(!atBottom.current);
          }}
        >
          {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
          {chat.hasHistory && !closed && (
            <Button
              variant="tertiary"
              disabled={chat.historyLoading}
              data-ph-capture-attribute-action="gomoku_chat_history_load"
              onClick={() => {
                const element = scroll.current;
                const anchor = element.querySelector(".gomoku-chat__bubble");
                historyAnchor.current = anchor
                  ? {
                      element: anchor,
                      offset:
                        anchor.getBoundingClientRect().top - element.getBoundingClientRect().top
                    }
                  : null;
                void chat.loadHistory();
              }}
            >
              {chat.historyLoading ? "불러오는 중..." : "이전 대화 보기"}
            </Button>
          )}
          {chat.historyError && (
            <p role="alert" className="gomoku-chat__error">
              {chat.historyError}
            </p>
          )}
          {chat.loading && (
            <p role="status" className="gomoku-chat__empty">
              대화를 불러오고 있어요.
            </p>
          )}
          {!chat.loading && messages.length === 0 && !chat.error && (
            <div className="gomoku-chat__empty">
              <MessageCircle aria-hidden="true" />
              <p>가벼운 인사를 건네보세요.</p>
              <span>입장 이후의 대화만 표시돼요.</span>
            </div>
          )}
          <div
            role="log"
            aria-label="게임방 대화 내용"
            aria-live="polite"
            aria-relevant="additions"
            className="gomoku-chat__messages"
          >
            {messages.map((message, index) => {
              const mine = message.senderId === String(memberId);
              const pending = !message.id;
              const continuesMinute = isSameMinuteGroup(message, messages[index + 1]);
              const continuesPrevious = isSameMinuteGroup(messages[index - 1], message);
              return (
                <article
                  key={message.id || message.clientMessageId}
                  className={[
                    "gomoku-chat__message",
                    mine ? " gomoku-chat__message--mine" : "",
                    continuesPrevious ? " gomoku-chat__message--continuation" : ""
                  ].join("")}
                >
                  {!mine && !continuesPrevious && (
                    <span className="gomoku-chat__author">
                      {message.senderRole === "SPECTATOR"
                        ? `[관전자] ${message.author}`
                        : message.author}
                    </span>
                  )}
                  <p className="gomoku-chat__bubble">{message.content}</p>
                  {message.createdAt && !continuesMinute && (
                    <time dateTime={message.createdAt}>{message.createdAt.slice(11, 16)}</time>
                  )}
                  {pending && !message.failed && (
                    <span role="status" className="gomoku-chat__delivery">
                      보내는 중...
                    </span>
                  )}
                  {pending && message.failed && (
                    <span className="gomoku-chat__delivery gomoku-chat__error">
                      전송 실패
                      {!closed && (
                        <button
                          type="button"
                          disabled={!connected}
                          data-ph-capture-attribute-action="gomoku_chat_message_retry"
                          onClick={() => chat.retry(message)}
                        >
                          다시 보내기
                        </button>
                      )}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </div>
        {away && (
          <Button
            className="gomoku-chat__latest"
            variant="secondary"
            data-ph-capture-attribute-action="gomoku_chat_scroll_latest"
            onClick={latest}
          >
            <ArrowDown aria-hidden="true" /> 최근 메시지
          </Button>
        )}
      </div>
      {chat.error && (
        <div className="gomoku-chat__error" role="alert">
          <p>{chat.error}</p>
          {!closed && (
            <Button
              variant="tertiary"
              disabled={closed}
              data-ph-capture-attribute-action="gomoku_chat_refresh"
              onClick={chat.refresh}
            >
              다시 불러오기
            </Button>
          )}
        </div>
      )}
      {closed ? (
        <p className="gomoku-chat__readonly">방이 종료되어 메시지를 보낼 수 없어요.</p>
      ) : (
        <form
          className="gomoku-chat__composer"
          onSubmit={send}
          data-ph-capture-attribute-action="gomoku_chat_message_submit"
        >
          <label className="ui-sr-only" htmlFor="gomoku-chat-message">
            게임방 메시지
          </label>
          <div className="gomoku-chat__input-row">
            <textarea
              id="gomoku-chat-message"
              rows={2}
              maxLength={2000}
              value={draft}
              placeholder="메시지를 입력하세요"
              aria-describedby={connected ? undefined : "gomoku-chat-hint"}
              data-ph-capture-attribute-action="gomoku_chat_message_input"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                )
                  send(event);
              }}
            />
            <Button
              type="submit"
              aria-label="게임방 메시지 전송"
              disabled={!connected || chat.loading || !draft.trim() || Boolean(chat.error)}
              data-ph-capture-attribute-action="gomoku_chat_message_send"
            >
              전송
            </Button>
          </div>
          {!connected && (
            <p id="gomoku-chat-hint" role="status">
              연결을 복구하고 있어요. 입력 내용은 유지돼요.
            </p>
          )}
        </form>
      )}
    </section>
  );
}

export function GomokuChat({ chat, memberId, closed, connected, seconds, playing }) {
  const compact = useSyncExternalStore(subscribe, compactSnapshot, () => false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState(null);
  const latestOther = chat.messages
    .filter((message) => message.senderId !== String(memberId))
    .at(-1)?.id;
  useEffect(() => {
    const media = window.matchMedia(mediaQuery);
    const resize = () => {
      setSeen(latestOther);
      setOpen(false);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, [latestOther]);
  const content = (
    <Conversation
      {...{ chat, memberId, closed, connected, draft, setDraft, compact, seconds, playing }}
    />
  );
  if (!compact) return content;
  const hasNew = Boolean(!open && latestOther && latestOther !== seen);
  return (
    <div className="gomoku-chat-mobile">
      <Modal
        open={open}
        onOpenChange={(next) => {
          setSeen(latestOther);
          setOpen(next);
        }}
        title="게임방 대화"
        closeLabel="게임방 채팅 닫기"
        closeAction="gomoku_chat_dismiss"
        panelClassName="gomoku-chat-modal"
        trigger={
          <Button
            variant="secondary"
            data-ph-capture-attribute-action="gomoku_chat_open"
            aria-label={hasNew ? "채팅, 새 메시지 있음" : "채팅"}
          >
            <MessageCircle aria-hidden="true" /> 채팅
            {hasNew && (
              <span className="gomoku-chat__new" aria-hidden="true">
                새 메시지
              </span>
            )}
          </Button>
        }
      >
        {content}
      </Modal>
    </div>
  );
}
