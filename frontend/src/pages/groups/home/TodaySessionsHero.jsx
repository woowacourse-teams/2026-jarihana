import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, ErrorState, Skeleton } from "../../../shared/ui/index.js";
import { TodayPlan } from "./TodayPlan.jsx";
import { TodaySessionTicket } from "./TodaySessionTicket.jsx";
import "./today-sessions.css";
import { useSessionCarousel } from "./useSessionCarousel.js";

const VISIBLE_TICKET_COUNT = 3;
const SWIPE_THRESHOLD = 40;

function formatHeroDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    weekday: "long"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

function todaySessions(groups, date) {
  return [...(groups ?? [])]
    .filter((group) => {
      if (group.type !== "SESSION") return false;
      if (!date) return Boolean(group.sessionSchedule);
      return group.sessionSchedule?.sessionDate === date;
    })
    .sort((left, right) => {
      const timeOrder = String(left.sessionSchedule?.startTime ?? "").localeCompare(
        String(right.sessionSchedule?.startTime ?? "")
      );
      if (timeOrder !== 0) return timeOrder;
      return left.id - right.id;
    });
}

function visibleTicketCount(viewport, firstTicket, groupCount) {
  if (groupCount <= 1 || !viewport || !firstTicket)
    return Math.min(groupCount, VISIBLE_TICKET_COUNT);
  const styles = window.getComputedStyle(viewport);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const ticketWidth = firstTicket.getBoundingClientRect().width;
  if (ticketWidth <= 0) return Math.min(groupCount, VISIBLE_TICKET_COUNT);
  const count = Math.floor((viewport.clientWidth + gap + 1) / (ticketWidth + gap));
  return Math.max(1, Math.min(groupCount, count));
}

function visibleTicketStart(activeIndex, groupCount, count) {
  return Math.min(activeIndex, Math.max(0, groupCount - count));
}

function isTicketFocusable(index, startIndex, count) {
  return index >= startIndex && index < startIndex + count;
}

function EmptyTodaySessions() {
  return (
    <div className="today-sessions-hero__empty">
      <p className="today-sessions-hero__empty-title">오늘 예정된 같이해요가 아직 없어요.</p>
      <p>아래 탐색에서 다음에 열릴 가벼운 자리를 확인해보세요.</p>
    </div>
  );
}

function LoadingTodaySessions() {
  return (
    <div className="today-sessions-hero__loading" aria-label="오늘 같이해요를 불러오는 중">
      <Skeleton className="today-sessions-hero__ticket-skeleton" count={3} />
      <Skeleton className="today-sessions-hero__plan-skeleton" />
    </div>
  );
}

export function TodaySessionsHero({ date, error, groups, isLoading = false, onRetry }) {
  const sessions = useMemo(() => todaySessions(groups, date), [date, groups]);
  const ticketReferences = useRef([]);
  const ticketsViewport = useRef(null);
  const pointerStart = useRef(null);
  const swiped = useRef(false);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_TICKET_COUNT);
  const {
    activeIndex,
    goNext,
    goPrevious,
    goTo,
    pauseFocus,
    pauseHover,
    reducedMotion,
    resumeFocus,
    resumeHover,
    setUserPaused,
    userPaused
  } = useSessionCarousel(sessions.length);
  const visibleStartIndex = visibleTicketStart(activeIndex, sessions.length, visibleCount);

  useEffect(() => {
    const viewport = ticketsViewport.current;
    if (!viewport) return undefined;

    function updateVisibleCount() {
      setVisibleCount(visibleTicketCount(viewport, ticketReferences.current[0], sessions.length));
    }

    const frame = window.requestAnimationFrame(updateVisibleCount);
    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sessions.length]);

  useEffect(() => {
    const activeTicket = ticketReferences.current[visibleStartIndex];
    const viewport = ticketsViewport.current;
    if (!activeTicket || !viewport) return;

    viewport.scrollTo({
      left: activeTicket.offsetLeft,
      behavior: reducedMotion ? "auto" : "smooth"
    });
  }, [reducedMotion, visibleStartIndex]);

  function handlePointerDown(event) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
  }

  function handlePointerUp(event) {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current.x;
    const verticalDistance = event.clientY - pointerStart.current.y;
    pointerStart.current = null;
    if (Math.abs(distance) < SWIPE_THRESHOLD || Math.abs(distance) <= Math.abs(verticalDistance))
      return;
    swiped.current = true;
    if (distance > 0) goPrevious({ pause: true });
    else goNext({ pause: true });
  }

  function handleBlur(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    resumeFocus();
  }

  return (
    <section className="today-sessions-hero" aria-labelledby="today-sessions-title">
      <div className="today-sessions-hero__intro">
        <div className="today-sessions-hero__meta">
          <p className="today-sessions-hero__eyebrow">오늘 바로 만나는 자리</p>
          {date ? (
            <time className="today-sessions-hero__date" dateTime={date}>
              {formatHeroDate(date)}
            </time>
          ) : null}
        </div>
        <h1 id="today-sessions-title">오늘의 같이해요를 먼저 확인해요</h1>
      </div>

      {isLoading ? <LoadingTodaySessions /> : null}

      {!isLoading && error ? (
        <ErrorState
          action={
            onRetry ? (
              <Button
                data-ph-capture-attribute-action="today_sessions_retry"
                onClick={onRetry}
                variant="secondary"
              >
                다시 시도
              </Button>
            ) : null
          }
          description="연결이 원활하지 않아 오늘 같이해요를 확인하지 못했어요."
          title="오늘의 같이해요를 불러오지 못했어요"
        />
      ) : null}

      {!isLoading && !error && sessions.length === 0 ? <EmptyTodaySessions /> : null}

      {!isLoading && sessions.length > 0 ? (
        <div
          className="today-sessions-hero__stage"
          onBlur={handleBlur}
          onFocus={pauseFocus}
          onMouseEnter={pauseHover}
          onMouseLeave={resumeHover}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          onClickCapture={(event) => {
            if (!swiped.current) return;
            event.preventDefault();
            event.stopPropagation();
            swiped.current = false;
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          role="region"
          aria-label="오늘 같이해요 캐러셀"
          aria-roledescription="carousel"
        >
          <div className="today-sessions-hero__carousel">
            {sessions.length > 1 ? (
              <>
                <button
                  aria-label={
                    reducedMotion
                      ? "동작 줄이기 설정으로 자동 전환 정지"
                      : userPaused
                        ? "오늘 같이해요 자동 전환 재생"
                        : "오늘 같이해요 자동 전환 일시정지"
                  }
                  disabled={reducedMotion}
                  className="today-sessions-hero__autoplay"
                  data-ph-capture-attribute-action="today_session_autoplay_toggle"
                  onClick={() => setUserPaused((current) => !current)}
                  type="button"
                >
                  <span aria-hidden="true">{userPaused || reducedMotion ? "▶" : "Ⅱ"}</span>
                </button>
                <button
                  aria-label="이전 같이해요 보기"
                  className="today-sessions-hero__nav today-sessions-hero__nav--previous"
                  data-ph-capture-attribute-action="today_session_previous"
                  onClick={() => goPrevious({ pause: true })}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  aria-label="다음 같이해요 보기"
                  className="today-sessions-hero__nav today-sessions-hero__nav--next"
                  data-ph-capture-attribute-action="today_session_next"
                  onClick={() => goNext({ pause: true })}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </>
            ) : null}

            <div className="today-sessions-hero__tickets" aria-live="off" ref={ticketsViewport}>
              {sessions.map((group, index) => (
                <div
                  className={classes(
                    "today-sessions-hero__ticket",
                    index === activeIndex && "today-sessions-hero__ticket--active"
                  )}
                  key={group.id}
                  ref={(node) => {
                    ticketReferences.current[index] = node;
                  }}
                >
                  <TodaySessionTicket
                    active={index === activeIndex}
                    group={group}
                    tabIndex={isTicketFocusable(index, visibleStartIndex, visibleCount) ? 0 : -1}
                  />
                </div>
              ))}
            </div>

            {sessions.length > 1 ? (
              <div className="today-sessions-hero__dots" aria-label="오늘 같이해요 순서">
                {sessions.map((group, index) => (
                  <button
                    aria-label={`${index + 1}번째 같이해요 보기`}
                    aria-pressed={index === activeIndex}
                    className="today-sessions-hero__dot"
                    data-ph-capture-attribute-action="today_session_dot_select"
                    key={group.id}
                    onClick={() => goTo(index, { pause: true })}
                    type="button"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <TodayPlan activeIndex={activeIndex} groups={sessions} />
        </div>
      ) : null}
    </section>
  );
}
