import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDateDays,
  buildCalendarDays,
  formatDateLabel,
  formatMonthLabel,
  minimumEndTime,
  monthStart,
  parseDateValue,
  shiftDateMonth,
  shiftVisibleMonth,
  toDateValue
} from "./dateRangeUtils.js";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

function isOutsideMonth(dateValue, visibleMonth) {
  return dateValue.slice(0, 7) !== visibleMonth.slice(0, 7);
}

function isInRange(dateValue, startDate, endDate) {
  return Boolean(startDate && endDate && dateValue > startDate && dateValue < endDate);
}

export function DateRangeCalendar({
  activeEndpoint,
  endDate,
  onMonthChange,
  onSelect,
  startDate,
  startValue,
  visibleMonth
}) {
  const calendarReference = useRef(null);
  const dayReferences = useRef(new Map());
  const pendingFocusReference = useRef("");
  const [visibleMonthCount, setVisibleMonthCount] = useState(1);
  const monthPanels = useMemo(
    () =>
      Array.from({ length: visibleMonthCount }, (_, index) =>
        shiftVisibleMonth(visibleMonth, index)
      ).map((monthValue) => ({
        days: buildCalendarDays(monthValue).map((dateValue) =>
          isOutsideMonth(dateValue, monthValue) ? "" : dateValue
        ),
        monthValue
      })),
    [visibleMonth, visibleMonthCount]
  );
  const renderedMonthDays = monthPanels.flatMap(({ days }) => days.filter(Boolean));
  const [today] = useState(() => toDateValue(new Date(Date.now())));
  const selectedDate = activeEndpoint === "start" ? startDate : endDate;
  const endpointLabel = activeEndpoint === "start" ? "모집 시작일" : "모집 마감일";

  useEffect(() => {
    const node = calendarReference.current;
    if (!node) return undefined;

    function updateVisibleMonthCount() {
      setVisibleMonthCount(node.getBoundingClientRect().width >= 704 ? 2 : 1);
    }

    updateVisibleMonthCount();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateVisibleMonthCount);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function isDisabled(dateValue) {
    if (activeEndpoint !== "end" || !startDate) return false;
    if (dateValue < startDate) return true;
    return dateValue === startDate && minimumEndTime(startValue, dateValue) === null;
  }

  function resolveKeyboardFocusDate() {
    const preferredDates = [
      selectedDate,
      activeEndpoint === "end" ? startDate : today
    ];
    const preferredDate = preferredDates.find(
      (dateValue) => dateValue && renderedMonthDays.includes(dateValue) && !isDisabled(dateValue)
    );
    if (preferredDate) return preferredDate;

    return (
      renderedMonthDays.find((dateValue) => !isDisabled(dateValue)) ??
      ""
    );
  }

  const keyboardFocusDate = resolveKeyboardFocusDate();

  useEffect(() => {
    if (!pendingFocusReference.current) return;
    const target = dayReferences.current.get(pendingFocusReference.current);
    if (target && !target.disabled) {
      target.focus();
      pendingFocusReference.current = "";
    }
  }, [visibleMonth, visibleMonthCount]);

  function focusRenderedDate(dateValue) {
    const target = dayReferences.current.get(dateValue);
    if (!target || target.disabled) return false;
    target.focus();
    return true;
  }

  function moveDayFocus(event, currentDate) {
    const offsets = { ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7 };
    let nextDate = offsets[event.key] ? addDateDays(currentDate, offsets[event.key]) : "";
    if (event.key === "PageDown") nextDate = shiftDateMonth(currentDate, 1);
    if (event.key === "PageUp") nextDate = shiftDateMonth(currentDate, -1);
    if (!nextDate || isDisabled(nextDate)) return;

    event.preventDefault();
    if (focusRenderedDate(nextDate)) return;
    pendingFocusReference.current = nextDate;
    onMonthChange(monthStart(nextDate));
  }

  return (
    <section
      aria-label={`${endpointLabel} 달력`}
      className="ui-date-range__calendar"
      ref={calendarReference}
    >
      <div className="ui-date-range__months">
        {monthPanels.map(({ days, monthValue }, panelIndex) => (
          <div
            className={classes(
              "ui-date-range__month-panel",
              panelIndex === 1 && "ui-date-range__month-panel--secondary"
            )}
            key={panelIndex === 0 ? "primary-month" : "secondary-month"}
          >
            <div className="ui-date-range__calendar-header">
              {panelIndex === 0 ? (
                <button
                  aria-label="이전 달"
                  className="ui-date-range__month-button"
                  onClick={() => onMonthChange(shiftVisibleMonth(visibleMonth, -1))}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={20} />
                </button>
              ) : (
                <span aria-hidden="true" className="ui-date-range__month-button-placeholder" />
              )}
              <strong aria-live={panelIndex === 0 ? "polite" : undefined}>
                {formatMonthLabel(monthValue)}
              </strong>
              {panelIndex === monthPanels.length - 1 ? (
                <button
                  aria-label="다음 달"
                  className="ui-date-range__month-button"
                  onClick={() => onMonthChange(shiftVisibleMonth(visibleMonth, 1))}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              ) : (
                <span aria-hidden="true" className="ui-date-range__month-button-placeholder" />
              )}
            </div>
            <div aria-hidden="true" className="ui-date-range__weekdays">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div aria-label={`${formatMonthLabel(monthValue)} 날짜`} className="ui-date-range__days">
              {days.map((dateValue, dayIndex) => {
                if (!dateValue) {
                  return (
                    <span
                      aria-hidden="true"
                      className="ui-date-range__day-placeholder"
                      key={`${monthValue}-empty-${dayIndex}`}
                    />
                  );
                }
                const date = parseDateValue(dateValue);
                const disabled = isDisabled(dateValue);
                const selected = dateValue === startDate || dateValue === endDate;
                return (
                  <button
                    aria-current={dateValue === today ? "date" : undefined}
                    aria-label={formatDateLabel(dateValue)}
                    aria-pressed={selected}
                    className={classes(
                      "ui-date-range__day",
                      isInRange(dateValue, startDate, endDate) && "ui-date-range__day--range",
                      dateValue === startDate && "ui-date-range__day--start",
                      dateValue === endDate && "ui-date-range__day--end"
                    )}
                    disabled={disabled}
                    key={dateValue}
                    onClick={() => onSelect(dateValue)}
                    onKeyDown={(event) => moveDayFocus(event, dateValue)}
                    ref={(node) => {
                      if (node) dayReferences.current.set(dateValue, node);
                      else dayReferences.current.delete(dateValue);
                    }}
                    tabIndex={dateValue === keyboardFocusDate ? 0 : -1}
                    type="button"
                  >
                    {date?.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="ui-date-range__calendar-hint">
        방향키로 날짜를 이동하고 <span>PageUp·PageDown</span>으로 달을 바꿔요.
      </p>
    </section>
  );
}
