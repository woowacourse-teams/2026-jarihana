import { ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DateRangeCalendar } from "./DateRangeCalendar.jsx";
import { DateRangeEndpoint } from "./DateRangeEndpoint.jsx";
import {
  addLocalDays,
  combineLocalDateTime,
  minimumEndTime,
  monthStart,
  splitLocalDateTime,
  toDateValue,
  toLocalDateTimeValue
} from "./dateRangeUtils.js";

const END_PRESETS = [
  { days: 3, label: "3일 뒤" },
  { days: 7, label: "1주 뒤" },
  { days: 14, label: "2주 뒤" }
];

export function DateRangePicker({
  alwaysOpen = false,
  endValue = "",
  error = "",
  onAlwaysOpenChange,
  onEndChange,
  onStartChange,
  startValue = ""
}) {
  const errorId = useId();
  const calendarId = useId();
  const rootReference = useRef(null);
  const startTrigger = useRef(null);
  const endTrigger = useRef(null);
  const start = splitLocalDateTime(startValue);
  const end = splitLocalDateTime(endValue);
  const [activeEndpoint, setActiveEndpoint] = useState("start");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(start.date || toDateValue(new Date(Date.now())))
  );
  const activeLabel = activeEndpoint === "start" ? "모집 시작일" : "모집 마감일";
  const endTimeMinimum = minimumEndTime(startValue, end.date);

  useEffect(() => {
    if (!calendarOpen) return undefined;
    function handleEscape(event) {
      if (event.key !== "Escape" || !rootReference.current?.contains(document.activeElement)) {
        return;
      }
      event.preventDefault();
      setCalendarOpen(false);
      const trigger = activeEndpoint === "start" ? startTrigger.current : endTrigger.current;
      trigger?.focus();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [activeEndpoint, calendarOpen]);

  function changeEndpoint(endpoint) {
    const selectedDate = endpoint === "start" ? start.date : end.date || start.date;
    if (endpoint === "end" && alwaysOpen) onAlwaysOpenChange(false);
    setActiveEndpoint(endpoint);
    setVisibleMonth(monthStart(selectedDate || toDateValue(new Date(Date.now()))));
    setCalendarOpen(true);
  }

  function changeDate(date) {
    if (activeEndpoint === "start") {
      const nextTime = start.time || splitLocalDateTime(toLocalDateTimeValue()).time;
      changeStart(combineLocalDateTime(date, nextTime));
      return;
    }

    const minimum = minimumEndTime(startValue, date);
    const preferredTime = end.time || start.time || "23:59";
    const nextTime = minimum && preferredTime < minimum ? minimum : preferredTime;
    onAlwaysOpenChange(false);
    onEndChange(combineLocalDateTime(date, nextTime));
  }

  function setStartToNow() {
    changeStart(toLocalDateTimeValue());
  }

  function changeStart(nextStart) {
    onStartChange(nextStart);
    if (alwaysOpen || !endValue || endValue > nextStart) return;
    const nextStartParts = splitLocalDateTime(nextStart);
    if (end.date !== nextStartParts.date) {
      onEndChange("");
      return;
    }
    const minimum = minimumEndTime(nextStart, end.date);
    onEndChange(minimum ? combineLocalDateTime(end.date, minimum) : "");
  }

  function setEndPreset(days) {
    const base = startValue || toLocalDateTimeValue();
    if (!startValue) onStartChange(base);
    const nextEnd = addLocalDays(base, days);
    onAlwaysOpenChange(false);
    onEndChange(nextEnd);
    setActiveEndpoint("end");
    setVisibleMonth(monthStart(splitLocalDateTime(nextEnd).date));
  }

  function setAlwaysOpen() {
    onEndChange("");
    onAlwaysOpenChange(true);
    setCalendarOpen(false);
  }

  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="ui-date-range"
      ref={rootReference}
    >
      <legend className="ui-sr-only">모집 기간</legend>
      <div aria-label="모집 기간 빠른 선택" className="ui-date-range__presets" role="group">
        <button onClick={setStartToNow} type="button">
          지금 시작
        </button>
        {END_PRESETS.map((preset) => {
          const presetEnd = addLocalDays(startValue, preset.days);
          return (
            <button
              aria-pressed={Boolean(presetEnd) && !alwaysOpen && endValue === presetEnd}
              key={preset.days}
              onClick={() => setEndPreset(preset.days)}
              type="button"
            >
              {preset.label}
            </button>
          );
        })}
        <button aria-pressed={alwaysOpen} onClick={setAlwaysOpen} type="button">
          상시 모집
        </button>
      </div>
      <div className="ui-date-range__endpoints">
        <DateRangeEndpoint
          active={activeEndpoint === "start"}
          controls={calendarOpen ? calendarId : undefined}
          date={start.date}
          endpoint="start"
          expanded={calendarOpen && activeEndpoint === "start"}
          invalid={Boolean(error)}
          onClick={() => changeEndpoint("start")}
          onTimeChange={(time) => changeStart(combineLocalDateTime(start.date, time))}
          reference={startTrigger}
          time={start.time}
        />
        <span aria-hidden="true" className="ui-date-range__connector">
          <ArrowRight size={20} strokeWidth={2.25} />
        </span>
        <DateRangeEndpoint
          active={activeEndpoint === "end"}
          controls={calendarOpen ? calendarId : undefined}
          date={alwaysOpen ? "" : end.date}
          endpoint="end"
          expanded={calendarOpen && activeEndpoint === "end"}
          invalid={Boolean(error)}
          onClick={() => changeEndpoint("end")}
          onTimeChange={(time) => onEndChange(combineLocalDateTime(end.date, time))}
          reference={endTrigger}
          summary={alwaysOpen ? "상시 모집" : ""}
          time={end.time}
          timeMinimum={endTimeMinimum}
        />
      </div>
      {calendarOpen ? (
        <div id={calendarId}>
          <DateRangeCalendar
            activeEndpoint={activeEndpoint}
            endDate={end.date}
            onMonthChange={setVisibleMonth}
            onSelect={changeDate}
            startDate={start.date}
            startValue={startValue}
            visibleMonth={visibleMonth}
          />
        </div>
      ) : null}
      {error ? (
        <p className="ui-date-range__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {calendarOpen ? (
        <span className="ui-sr-only" aria-live="polite">
          {activeLabel} 달력이 열렸어요.
        </span>
      ) : null}
    </fieldset>
  );
}

export { toLocalDateTimeValue } from "./dateRangeUtils.js";
