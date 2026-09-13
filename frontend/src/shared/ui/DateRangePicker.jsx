import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DateRangeCalendar } from "./DateRangeCalendar.jsx";
import { DateRangeEndpoint } from "./DateRangeEndpoint.jsx";
import { TimePickerPopover } from "./TimePickerPopover.jsx";
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
  const popoverReference = useRef(null);
  const startTrigger = useRef(null);
  const endTrigger = useRef(null);
  const startTimeTrigger = useRef(null);
  const endTimeTrigger = useRef(null);
  const start = splitLocalDateTime(startValue);
  const end = splitLocalDateTime(endValue);
  const [activeEndpoint, setActiveEndpoint] = useState("start");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activeTimeEndpoint, setActiveTimeEndpoint] = useState(null);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(start.date || toDateValue(new Date(Date.now())))
  );
  const activeLabel = activeEndpoint === "start" ? "모집 시작일" : "모집 마감일";
  const endTimeMinimum = minimumEndTime(startValue, end.date);

  const closePicker = useCallback(
    ({ restoreFocus = false } = {}) => {
      setCalendarOpen(false);
      setActiveTimeEndpoint(null);
      if (!restoreFocus) return;
      const trigger = activeTimeEndpoint
        ? activeTimeEndpoint === "start"
          ? startTimeTrigger.current
          : endTimeTrigger.current
        : activeEndpoint === "start"
          ? startTrigger.current
          : endTrigger.current;
      trigger?.focus();
    },
    [activeEndpoint, activeTimeEndpoint]
  );

  useEffect(() => {
    if (!calendarOpen && !activeTimeEndpoint) return undefined;
    function handleEscape(event) {
      if (event.key !== "Escape" || !rootReference.current?.contains(document.activeElement)) {
        return;
      }
      event.preventDefault();
      closePicker({ restoreFocus: true });
    }
    function handlePointerDown(event) {
      if (popoverReference.current?.contains(event.target)) return;
      if (popoverReference.current?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      closePicker();
    }
    function handleFocusIn(event) {
      if (!popoverReference.current?.contains(event.target)) closePicker();
    }
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [activeTimeEndpoint, calendarOpen, closePicker]);

  function changeEndpoint(endpoint) {
    const selectedDate = endpoint === "start" ? start.date : end.date || start.date;
    if (endpoint === "end" && alwaysOpen) onAlwaysOpenChange(false);
    setActiveEndpoint(endpoint);
    setActiveTimeEndpoint(null);
    setVisibleMonth(monthStart(selectedDate || toDateValue(new Date(Date.now()))));
    setCalendarOpen(true);
  }

  function changeDate(date) {
    if (activeEndpoint === "start") {
      const nextTime = start.time || splitLocalDateTime(toLocalDateTimeValue()).time;
      changeStart(combineLocalDateTime(date, nextTime));
      closePicker({ restoreFocus: true });
      return;
    }

    const minimum = minimumEndTime(startValue, date);
    const preferredTime = end.time || start.time || "23:59";
    const nextTime = minimum && preferredTime < minimum ? minimum : preferredTime;
    onAlwaysOpenChange(false);
    onEndChange(combineLocalDateTime(date, nextTime));
    closePicker({ restoreFocus: true });
  }

  function setStartToNow() {
    changeStart(toLocalDateTimeValue());
    closePicker();
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
    closePicker();
  }

  function setAlwaysOpen() {
    onEndChange("");
    onAlwaysOpenChange(true);
    closePicker();
  }

  function openTimePicker(endpoint) {
    setActiveEndpoint(endpoint);
    setCalendarOpen(false);
    setActiveTimeEndpoint(endpoint);
  }

  function changeTime(endpoint, time) {
    if (endpoint === "start") {
      changeStart(combineLocalDateTime(start.date, time));
      return;
    }
    onEndChange(combineLocalDateTime(end.date, time));
  }

  const timePickerId = `${calendarId}-time`;
  const timePicker = activeTimeEndpoint ? (
    <div className="ui-date-range__time-popover" id={timePickerId} ref={popoverReference}>
      <TimePickerPopover
        label={activeTimeEndpoint === "start" ? "모집 시작 시간" : "모집 마감 시간"}
        minimum={activeTimeEndpoint === "end" ? endTimeMinimum : undefined}
        onChange={(time) => changeTime(activeTimeEndpoint, time)}
        value={activeTimeEndpoint === "start" ? start.time : end.time}
      />
    </div>
  ) : null;

  const calendar = calendarOpen ? (
    <div className="ui-date-range__calendar-popover" id={calendarId} ref={popoverReference}>
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
  ) : null;

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
          calendar={activeEndpoint === "start" ? calendar : null}
          controls={calendarOpen && activeEndpoint === "start" ? calendarId : undefined}
          date={start.date}
          endpoint="start"
          expanded={calendarOpen && activeEndpoint === "start"}
          invalid={Boolean(error)}
          onClick={() => changeEndpoint("start")}
          onTimeClick={() => openTimePicker("start")}
          reference={startTrigger}
          time={start.time}
          timeControls={activeTimeEndpoint === "start" ? timePickerId : undefined}
          timeExpanded={activeTimeEndpoint === "start"}
          timePopover={activeTimeEndpoint === "start" ? timePicker : null}
          timeReference={startTimeTrigger}
        />
        <span aria-hidden="true" className="ui-date-range__connector">
          <ArrowRight size={20} strokeWidth={2.25} />
        </span>
        <DateRangeEndpoint
          active={activeEndpoint === "end"}
          calendar={activeEndpoint === "end" ? calendar : null}
          controls={calendarOpen && activeEndpoint === "end" ? calendarId : undefined}
          date={alwaysOpen ? "" : end.date}
          endpoint="end"
          expanded={calendarOpen && activeEndpoint === "end"}
          invalid={Boolean(error)}
          onClick={() => changeEndpoint("end")}
          onTimeClick={() => openTimePicker("end")}
          reference={endTrigger}
          summary={alwaysOpen ? "상시 모집" : ""}
          time={end.time}
          timeControls={activeTimeEndpoint === "end" ? timePickerId : undefined}
          timeExpanded={activeTimeEndpoint === "end"}
          timePopover={activeTimeEndpoint === "end" ? timePicker : null}
          timeReference={endTimeTrigger}
        />
      </div>
      {error ? (
        <p className="ui-date-range__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {calendarOpen || activeTimeEndpoint ? (
        <span className="ui-sr-only" aria-live="polite">
          {calendarOpen ? `${activeLabel} 달력이 열렸어요.` : "시간 선택창이 열렸어요."}
        </span>
      ) : null}
    </fieldset>
  );
}

export { toLocalDateTimeValue } from "./dateRangeUtils.js";
