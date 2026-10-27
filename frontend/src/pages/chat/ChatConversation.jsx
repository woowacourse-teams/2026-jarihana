import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowDown,
  ArrowLeft,
  LockKeyhole,
  MessageCircle,
  Users
} from "lucide-react";

import { Avatar, Button } from "../../shared/ui";
import { messageDay, messageTime } from "./format.js";
import { ChatLink } from "../../features/chat/ChatLink";

export function ChatConversation({ room, draft, onDraftChange, onSend, sending, sendDisabled, error, onRetry, onRead, hasOlder, loadingHistory, onLoadOlder, syncCursor, connection, onViewingLatestChange }) {
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scrollRef = useRef(null);
  const headingRef = useRef(null);
  const inputRef = useRef(null);
  const awayRef = useRef(false);
  const anchorRef = useRef(null);
  const latestMessage = room.messages.at(-1);
  const ended = room.status === "ENDED";

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [draft, ended]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (anchorRef.current && !loadingHistory) {
      element.scrollTop += element.scrollHeight - anchorRef.current;
      anchorRef.current = null;
    } else if (!anchorRef.current && !awayRef.current) element.scrollTop = element.scrollHeight;
  }, [room.id, latestMessage?.id, room.messages.length, loadingHistory]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (!awayRef.current && !anchorRef.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [room.id]);

  useEffect(() => {
    function observeRead() {
      const element = scrollRef.current;
      const saved = room.messages.filter((message) => message.sequence).at(-1);
      const viewingLatest = Boolean(element && element.scrollHeight - element.scrollTop - element.clientHeight < 2 &&
        document.visibilityState === "visible" && document.hasFocus() && (!saved || saved.sequence === syncCursor));
      onViewingLatestChange?.(room.id, viewingLatest);
      if (viewingLatest && saved) void onRead(saved.sequence);
    }
    observeRead();
    const element = scrollRef.current;
    element.addEventListener("scroll", observeRead);
    window.addEventListener("focus", observeRead);
    const onBlur = () => onViewingLatestChange?.(room.id, false);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", observeRead);
    const timer = window.setInterval(observeRead, 30000);
    return () => {
      element.removeEventListener("scroll", observeRead);
      window.removeEventListener("focus", observeRead);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", observeRead);
      window.clearInterval(timer);
    };
  }, [room.id, room.messages, syncCursor, onRead, onViewingLatestChange]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) headingRef.current?.focus({ preventScroll: true });
  }, [room.id]);

  function sendMessage(event) {
    event.preventDefault();
    if (ended || sendDisabled || !draft.trim()) return;
    onSend();
    inputRef.current?.focus({ preventScroll: true });
  }

  function scrollToBottom() {
    const element = scrollRef.current;
    element.scrollTop = element.scrollHeight;
    awayRef.current = false;
    setAwayFromBottom(false);
  }

  return (
    <section aria-labelledby="chat-room-title" className="chat-conversation">
      <header className="chat-conversation__header">
        <ChatLink
          className="ui-button ui-button--tertiary ui-icon-button chat-icon-button chat-back"
          aria-label="채팅 목록으로"
          data-ph-capture-attribute-action="chat_list_back"
        >
          <ArrowLeft aria-hidden="true" />
        </ChatLink>
        <Link
          className="chat-conversation__group"
          to={`/groups/${room.id}`}
          aria-label={`${room.name} 모임 상세 보기`}
          data-ph-capture-attribute-action="chat_group_open"
        >
          <div className="chat-conversation__identity">
            <h2 id="chat-room-title" tabIndex={-1} ref={headingRef}>
              {room.name}
            </h2>
            <span>
              <Users aria-hidden="true" /> 참여자 {room.memberCount}명{ended ? " · 종료된 모임" : ""}
            </span>
          </div>
        </Link>
      </header>

      <div className="chat-history-wrap">
        <div
          className="chat-history"
          ref={scrollRef}
          role="region"
          aria-label="대화 스크롤 영역"
          onScroll={(event) => {
            const element = event.currentTarget;
            awayRef.current = element.scrollHeight - element.scrollTop - element.clientHeight > 80;
            setAwayFromBottom(awayRef.current);
          }}
        >
          <button
            className="ui-sr-only chat-history-skip"
            type="button"
            onClick={scrollToBottom}
            data-ph-capture-attribute-action="chat_scroll_latest"
          >
            최근 메시지로 이동
          </button>
          {hasOlder && <button className="ui-button ui-button--tertiary" type="button" disabled={loadingHistory}
            data-ph-capture-attribute-action="chat_history_load" onClick={() => {
              anchorRef.current = scrollRef.current.scrollHeight;
              awayRef.current = true;
              void onLoadOlder();
            }}>{loadingHistory ? "불러오는 중…" : "이전 대화 보기"}</button>}
          {room.messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty__icon">
                <MessageCircle aria-hidden="true" />
              </span>
              <h3>첫 이야기를 시작해 보세요</h3>
              <p>가벼운 인사 한마디면 충분해요.</p>
            </div>
          ) : (
            <div
              className="chat-thread"
              role="log"
              aria-label={`${room.name} 대화 내용`}
              aria-live="polite"
              aria-relevant="additions"
            >
              {room.messages.map((message, index) => {
                const previous = room.messages[index - 1];
                const newDay = !previous || messageDay(previous.at) !== messageDay(message.at);
                const grouped = !newDay && previous.senderId === message.senderId && previous.author === message.author;
                return (
                  <Fragment key={message.id}>
                    {newDay && (
                      <div className="chat-date">
                        <span>{messageDay(message.at)}</span>
                      </div>
                    )}
                    <div
                      className={`chat-message${message.mine ? " chat-message--mine" : ""}${grouped ? " chat-message--grouped" : ""}`}
                    >
                      {!message.mine && (
                        <div className="chat-message__avatar">
                          {!grouped && (
                            <Avatar alt="" src={message.avatarUrl} fallback={message.author.slice(0, 1)} size="sm" />
                          )}
                        </div>
                      )}
                      <div className="chat-message__content">
                        {!message.mine && !grouped && (
                          <span className="chat-message__author">{message.author}</span>
                        )}
                        <div className="chat-message__line">
                          <p className="chat-message__bubble">{message.text}</p>
                          <time dateTime={message.at}>{messageTime(message.at)}</time>
                        </div>
                        {message.pending && <span role="status">보내는 중…</span>}
                        {message.failed && <button type="button" className="ui-button ui-button--tertiary" data-ph-capture-attribute-action="chat_message_retry" onClick={() => onRetry(message)}>전송 실패 · 다시 보내기</button>}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
        {awayFromBottom && (
          <button
            className="ui-button ui-button--secondary chat-latest"
            type="button"
            onClick={scrollToBottom}
            data-ph-capture-attribute-action="chat_scroll_latest"
          >
            <ArrowDown aria-hidden="true" />
            최근 메시지
          </button>
        )}
      </div>

      {ended ? (
        <div className="chat-readonly">
          <LockKeyhole aria-hidden="true" />
          <p>종료된 모임이에요. 나눴던 이야기는 계속 볼 수 있어요.</p>
        </div>
      ) : (
        <form
          className="chat-composer"
          onSubmit={sendMessage}
          data-ph-capture-attribute-action="chat_message_submit"
        >
          <label className="ui-sr-only" htmlFor="chat-message">메시지</label>
          <div className="chat-composer__field">
            <textarea
              className="ui-field__control ui-field__control--underline"
              id="chat-message"
              aria-describedby={error ? "chat-message-hint chat-message-error" : "chat-message-hint"}
              aria-invalid={error ? "true" : undefined}
              ref={inputRef}
              rows={1}
              maxLength={2000}
              value={draft}
              placeholder="모임에 이야기를 건네보세요"
              data-ph-capture-attribute-action="chat_message_input"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                )
                  sendMessage(event);
              }}
            />
            <Button
              className="chat-send"
              disabled={sendDisabled || !draft.trim()}
              type="submit"
              aria-label={sending ? "메시지 전송 중" : "메시지 전송"}
              data-ph-capture-attribute-action="chat_message_send"
            >
              전송
            </Button>
          </div>
          <div className="ui-field__help chat-composer__hint" id="chat-message-hint">
            <span role="status">{connection === "connected" ? "" : "연결을 다시 확인하고 있어요"}</span>
            <span className="chat-keyboard-hint">Enter 전송 · Shift + Enter 줄바꿈</span>
          </div>
          {error && <p className="ui-field__error chat-composer__error" id="chat-message-error" role="alert">{error}</p>}
        </form>
      )}

    </section>
  );
}
