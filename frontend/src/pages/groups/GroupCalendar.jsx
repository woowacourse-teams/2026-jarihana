import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import "./groupCalendar.css";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const FULL_DAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = fromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function addMonths(dateKey, months) {
  const date = fromDateKey(dateKey);
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  return toDateKey(date);
}

function startOfWeek(dateKey) {
  return addDays(dateKey, -fromDateKey(dateKey).getUTCDay());
}

function getTodayInSeoul() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getVisibleRange(dateKey, view) {
  if (view === "week") {
    const from = startOfWeek(dateKey);
    return { from, to: addDays(from, 6) };
  }

  const first = `${dateKey.slice(0, 7)}-01`;
  const from = startOfWeek(first);
  const last = addDays(addMonths(first, 1), -1);
  return { from, to: addDays(last, 6 - fromDateKey(last).getUTCDay()) };
}

function dateLabel(dateKey) {
  const date = fromDateKey(dateKey);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${FULL_DAY_LABELS[date.getUTCDay()]}`;
}

function timeLabel(event, dateKey, includeEnd = false) {
  if (event.allDay) return "종일";
  if (!event.startTime) return "";
  const start = event.startTime.slice(0, 5);
  const end = event.endTime?.slice(0, 5);
  if (event.startDate !== event.endDate) {
    if (dateKey === event.startDate) return start;
    if (dateKey === event.endDate && includeEnd && end) return `${end} 종료`;
    return "";
  }
  return includeEnd && end ? `${start}–${end}` : start;
}

function eventKey(event) {
  return `${event.kind}:${event.occurrenceKey ?? event.id ?? event.startDate}`;
}

function hasFlexibleScheduleOnDate(calendar, dateKey) {
  if (calendar?.showBaseSchedule === false) return false;
  const periods = [calendar?.flexibleBeforeFirstRecurring, ...(calendar?.flexibleAfterRecurring ?? [])];
  return periods.some((period) => period?.fromDate <= dateKey
    && (!period.untilDate || period.untilDate >= dateKey));
}

function EventButton({ compact = false, dateKey, event, onOpen }) {
  const time = timeLabel(event, dateKey, !compact);
  const eventStyle = event.kind === "REGULAR_MEETING" ? "recurring" : event.kind.toLowerCase();
  const className = `group-calendar__event group-calendar__event--${eventStyle}${compact ? " group-calendar__event--compact" : ""}`;
  const content = (
    <span className="group-calendar__event-copy">
      {time ? <span className="group-calendar__event-time">{time}</span> : null}
      <span className="group-calendar__event-title">{event.title}</span>
    </span>
  );
  if (!onOpen) return <span className={className}>{content}</span>;
  return (
    <button
      className={className}
      data-ph-capture-attribute-action="group_calendar_event_open"
      onClick={() => onOpen?.(event)}
      type="button"
    >
      {content}
      {!compact ? <ChevronRight aria-hidden="true" size={18} /> : null}
    </button>
  );
}

/**
 * Receives only the public calendar DTO. Private descriptions and locations belong to a
 * separate member-only detail request made after onEventOpen.
 */
export function GroupCalendar({
  calendar,
  error,
  initialDate,
  isLeader = false,
  loading = false,
  onCreateEvent,
  onEventOpen,
  onRangeChange,
  onRetry,
  onToggleBase,
  togglePending = false,
  settingsError = null
}) {
  const today = getTodayInSeoul();
  const [selectedDate, setSelectedDate] = useState(initialDate ?? today);
  const [view, setView] = useState("month");
  const range = useMemo(() => getVisibleRange(selectedDate, view), [selectedDate, view]);

  useEffect(() => {
    onRangeChange?.(range);
  }, [onRangeChange, range]);

  const days = useMemo(() => {
    const count = Math.round((fromDateKey(range.to) - fromDateKey(range.from)) / 86400000) + 1;
    return Array.from({ length: count }, (_, index) => addDays(range.from, index));
  }, [range]);

  const eventsByDay = useMemo(() => {
    const events = (calendar?.events ?? []).filter((event) =>
      calendar?.showBaseSchedule !== false || event.kind === "GROUP_EVENT" || event.kind === "REGULAR_MEETING");
    const result = new Map(days.map((day) => [day, []]));
    for (const event of events) {
      for (const day of days) {
        if (event.startDate <= day && event.endDate >= day) result.get(day).push(event);
      }
    }
    for (const dayEvents of result.values()) {
      dayEvents.sort((a, b) => {
        const aTime = a.allDay ? "" : a.startTime ?? "";
        const bTime = b.allDay ? "" : b.startTime ?? "";
        return aTime.localeCompare(bTime) || a.title.localeCompare(b.title, "ko");
      });
    }
    return result;
  }, [calendar?.events, calendar?.showBaseSchedule, days]);

  function move(direction) {
    setSelectedDate((current) => view === "week" ? addDays(current, direction * 7) : addMonths(current, direction));
  }

  const year = Number(selectedDate.slice(0, 4));
  const month = Number(selectedDate.slice(5, 7));
  const heading = view === "month"
    ? `${year}년 ${month}월`
    : `${range.from.slice(0, 4)}년 ${Number(range.from.slice(5, 7))}월 ${Number(range.from.slice(8))}일 – ${Number(range.to.slice(5, 7))}월 ${Number(range.to.slice(8))}일`;
  const selectedEvents = eventsByDay.get(selectedDate) ?? [];
  const selectedDateIsFlexible = hasFlexibleScheduleOnDate(calendar, selectedDate);

  return (
    <section aria-label="모임 캘린더" className="group-calendar">
      <div className="group-calendar__toolbar">
        <div className="group-calendar__navigation">
          <h2>{heading}</h2>
          <button
            className="group-calendar__today-button"
            data-ph-capture-attribute-action="group_calendar_today"
            onClick={() => setSelectedDate(today)}
            type="button"
          >
            오늘
          </button>
          <div aria-label="날짜 이동" className="group-calendar__arrows" role="group">
            <button aria-label="이전 기간" data-ph-capture-attribute-action="group_calendar_previous" onClick={() => move(-1)} type="button">
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
            <button aria-label="다음 기간" data-ph-capture-attribute-action="group_calendar_next" onClick={() => move(1)} type="button">
              <ChevronRight aria-hidden="true" size={20} />
            </button>
          </div>
        </div>
        <div className="group-calendar__actions">
          <div aria-label="달력 보기" className="group-calendar__view-switch" role="group">
            <button aria-pressed={view === "month"} data-ph-capture-attribute-action="group_calendar_month_view" onClick={() => setView("month")} type="button">월</button>
            <button aria-pressed={view === "week"} data-ph-capture-attribute-action="group_calendar_week_view" onClick={() => setView("week")} type="button">주</button>
          </div>
          {isLeader && onCreateEvent ? (
            <button className="group-calendar__create" data-ph-capture-attribute-action="group_calendar_event_create_open" onClick={() => onCreateEvent?.(selectedDate)} type="button">
              <Plus aria-hidden="true" size={18} /> 일정 추가
            </button>
          ) : null}
        </div>
      </div>

      <div aria-label="일정 종류" className="group-calendar__legend">
        <span><i className="group-calendar__swatch group-calendar__swatch--recurring" /> 정기 모임</span>
        <span><i className="group-calendar__swatch group-calendar__swatch--group-event" /> 개별 일정</span>
        <span><i className="group-calendar__swatch group-calendar__swatch--session" /> 같이해요</span>
        {isLeader && onToggleBase ? <label className="group-calendar__visibility">
          <input checked={calendar?.showBaseSchedule ?? true}
            data-ph-capture-attribute-action="group_calendar_base_schedule_toggle"
            disabled={!calendar || togglePending}
            onChange={() => onToggleBase(!calendar.showBaseSchedule)} type="checkbox" />
          정기·세션 일정 표시
        </label> : null}
      </div>
      {settingsError ? <p className="group-calendar-form__error" role="alert">표시 설정을 저장하지 못했어요.</p> : null}

      {error ? (
        <div className="group-calendar__state" role="alert">
          <p>일정을 불러오지 못했어요.</p>
          <button data-ph-capture-attribute-action="group_calendar_retry" onClick={onRetry} type="button">다시 시도</button>
        </div>
      ) : null}
      {loading && !calendar && !error ? (
        <div className="group-calendar__loading" role="status">일정을 불러오는 중이에요.</div>
      ) : null}
      <div aria-busy={loading} className="group-calendar__grid">
        <div className="group-calendar__weekdays">
          {DAY_LABELS.map((label, index) => <span key={label} aria-label={FULL_DAY_LABELS[index]}>{label}</span>)}
        </div>
        <div className={`group-calendar__days${view === "week" ? " group-calendar__days--week" : ""}`}>
          {days.map((day) => {
            const dayEvents = eventsByDay.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selectedDate;
            const isOtherMonth = day.slice(0, 7) !== selectedDate.slice(0, 7);
            return (
              <div className={`group-calendar__day${isSelected ? " is-selected" : ""}${isOtherMonth && view === "month" ? " is-outside" : ""}`} key={day}>
                <button
                  aria-label={`${dateLabel(day)}, 일정 ${dayEvents.length}개`}
                  aria-pressed={isSelected}
                  className={`group-calendar__date${isToday ? " is-today" : ""}`}
                  data-ph-capture-attribute-action="group_calendar_date_select"
                  onClick={() => setSelectedDate(day)}
                  type="button"
                >
                  <span className="group-calendar__date-number">{fromDateKey(day).getUTCDate()}</span>
                </button>
                <div className="group-calendar__day-events">
                  {dayEvents.slice(0, 3).map((event) => (
                    <EventButton compact dateKey={day} event={event} key={eventKey(event)} onOpen={onEventOpen} />
                  ))}
                  {dayEvents.length > 3 ? <span className="group-calendar__more">+{dayEvents.length - 3}개 더보기</span> : null}
                </div>
                <div aria-hidden="true" className="group-calendar__dots">
                  {dayEvents.slice(0, 3).map((event) => <i className={`group-calendar__dot group-calendar__dot--${event.kind.toLowerCase()}`} key={eventKey(event)} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div aria-live="polite" className="group-calendar__agenda">
            <div className="group-calendar__agenda-heading">
              <h3>{dateLabel(selectedDate)}</h3>
              <span>일정 {selectedEvents.length}개</span>
            </div>
            {selectedEvents.length ? (
              <ul>
                {selectedEvents.map((event) => (
                  <li key={eventKey(event)}><EventButton dateKey={selectedDate} event={event} onOpen={onEventOpen} /></li>
                ))}
              </ul>
            ) : !selectedDateIsFlexible ? <p className="group-calendar__empty">{error || loading ? "일정을 불러오면 이곳에 표시돼요." : "등록된 일정이 없어요."}</p> : null}
            {selectedDateIsFlexible ? (
              <p className="group-calendar__flexible-note" role="note">이 날짜에는 정해진 정기 모임 없이 유동적으로 운영했어요.</p>
            ) : null}
            {selectedEvents.length ? <p className="group-calendar__privacy-note">장소와 설명은 모임원에게만 보여요.</p> : null}
      </div>
    </section>
  );
}
