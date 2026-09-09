import { CalendarDays, Clock3 } from "lucide-react";
import { formatEndpointDate, formatEndpointTime } from "./dateRangeUtils.js";

export function DateRangeEndpoint({
  active,
  calendar,
  controls,
  date,
  endpoint,
  expanded,
  invalid,
  onClick,
  onTimeClick,
  reference,
  summary,
  time,
  timeControls,
  timeExpanded,
  timePopover,
  timeReference
}) {
  const isStart = endpoint === "start";
  const label = isStart ? "모집 시작일" : "모집 마감일";
  const timeLabel = isStart ? "모집 시작 시간" : "모집 마감 시간";

  return (
    <div
      className="ui-date-range__endpoint"
      data-active={active || undefined}
      data-invalid={invalid || undefined}
    >
      <div className="ui-date-range__endpoint-fields">
        <div className="ui-date-range__endpoint-field">
          <span className="ui-date-range__field-label">
            <CalendarDays aria-hidden="true" size={18} />
            {label}
          </span>
          <button
            aria-controls={controls}
            aria-expanded={expanded}
            aria-label={`${label} 선택`}
            className="ui-date-range__endpoint-button ui-field__control--underline"
            onClick={onClick}
            ref={reference}
            type="button"
          >
            <strong>{summary || formatEndpointDate(date)}</strong>
          </button>
          {calendar}
        </div>
        {date && !summary ? (
          <div className="ui-date-range__endpoint-field ui-date-range__time">
            <span className="ui-date-range__field-label">
              <Clock3 aria-hidden="true" size={16} />
              {timeLabel}
            </span>
            <button
              aria-controls={timeControls}
              aria-expanded={timeExpanded}
              aria-haspopup="dialog"
              aria-label={`${timeLabel} 선택`}
              className="ui-date-range__endpoint-button ui-field__control--underline"
              onClick={onTimeClick}
              ref={timeReference}
              type="button"
            >
              <strong>{formatEndpointTime(time)}</strong>
            </button>
            {timePopover}
          </div>
        ) : !isStart ? (
          <div className="ui-date-range__endpoint-field ui-date-range__time">
            <span className="ui-date-range__field-label">
              <Clock3 aria-hidden="true" size={16} />
              {timeLabel}
            </span>
            <span className="ui-date-range__static-control">
              {summary ? "없음" : "날짜 선택 후 설정"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
