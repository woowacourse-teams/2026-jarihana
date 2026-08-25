import { useId } from "react";

import { Select, TextField } from "../../shared/ui/index.js";

export const DAYS = [
  ["MONDAY", "월요일", "월"],
  ["TUESDAY", "화요일", "화"],
  ["WEDNESDAY", "수요일", "수"],
  ["THURSDAY", "목요일", "목"],
  ["FRIDAY", "금요일", "금"],
  ["SATURDAY", "토요일", "토"],
  ["SUNDAY", "일요일", "일"]
];

export const GROUP_TYPES = [
  ["STUDY", "스터디"],
  ["CLUB", "동아리"],
  ["SESSION", "세션"]
];

export const MEETING_TYPES = [
  ["OFFLINE", "오프라인"],
  ["ONLINE", "온라인"],
  ["FLEXIBLE", "유동적"]
];

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const WEEKENDS = ["SATURDAY", "SUNDAY"];
const EVERY_DAY = [...WEEKDAYS, ...WEEKENDS];

const QUICK_PRESETS = [
  ["평일", WEEKDAYS],
  ["주말", WEEKENDS],
  ["매일", EVERY_DAY]
];

const LOCATION_PLACEHOLDER = {
  FLEXIBLE: "정해지면 입력해요",
  OFFLINE: "선릉 캠퍼스 3층",
  ONLINE: "접속 링크나 참여 방법"
};

function sameDays(selectedDays, targetDays) {
  return (
    selectedDays.length === targetDays.length &&
    targetDays.every((day) => selectedDays.includes(day))
  );
}

export function GroupContentTabs({ onSelect, value }) {
  const selectAdjacentTab = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const tabs = ["intro", "members"];
    const currentIndex = tabs.indexOf(value);
    const nextValue =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs.at(-1)
          : tabs[
              (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
            ];

    onSelect(nextValue);
    event.currentTarget.parentElement.querySelector(`[data-content-tab="${nextValue}"]`)?.focus();
  };

  return (
    <div className="group-editor__content-tabs" aria-label="모임 콘텐츠" role="tablist">
      <button
        aria-selected={value === "intro"}
        data-content-tab="intro"
        onKeyDown={selectAdjacentTab}
        onClick={() => onSelect("intro")}
        role="tab"
        tabIndex={value === "intro" ? 0 : -1}
        type="button"
      >
        소개
      </button>
      <button
        aria-disabled="true"
        aria-selected="false"
        disabled
        role="tab"
        tabIndex={-1}
        title="활동기록 API가 준비되면 제공할 예정이에요."
        type="button"
      >
        활동기록
      </button>
      <button
        aria-selected={value === "members"}
        data-content-tab="members"
        onKeyDown={selectAdjacentTab}
        onClick={() => onSelect("members")}
        role="tab"
        tabIndex={value === "members" ? 0 : -1}
        type="button"
      >
        멤버
      </button>
    </div>
  );
}

/*
 * The create screen picks a type; the manage screen shows the same slot as a
 * locked tag because the API does not allow changing it after creation.
 */
export function GroupTypeField({ error, lockedLabel, register }) {
  const labelId = useId();

  if (lockedLabel) {
    return (
      <div className="group-editor__type-field">
        <span className="group-editor__field-label" id={labelId}>
          모임 종류
        </span>
        <div
          aria-disabled="true"
          aria-labelledby={labelId}
          className="group-editor__type-tag group-editor__type-tag--locked"
          title="생성된 모임의 종류는 변경할 수 없어요."
        >
          <span>{lockedLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group-editor__type-field">
      <span className="group-editor__field-label" id={labelId}>
        모임 종류
      </span>
      <div aria-labelledby={labelId} className="group-editor__type-seg" role="radiogroup">
        {GROUP_TYPES.map(([value, label]) => (
          <label className="group-editor__type-option" key={value}>
            <input type="radio" value={value} {...register("type")} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="group-editor__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function OverviewFields({ className = "", errors, register }) {
  return (
    <div className={`group-editor__overview-fields ${className}`.trim()}>
      <TextField
        label="모임 이름"
        maxLength={50}
        autoComplete="off"
        error={errors.name?.message}
        {...register("name")}
      />
      <TextField
        label="한 줄 소개"
        maxLength={100}
        error={errors.introduction?.message}
        {...register("introduction")}
      />
    </div>
  );
}

/* Both screens edit these in the hero, so a group reads the same way everywhere. */
export function MeetingFields({ errors, meetingType, register }) {
  return (
    <>
      <div className="group-editor__fact">
        <Select label="모임 방식" error={errors.meetingType?.message} {...register("meetingType")}>
          {MEETING_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="group-editor__fact">
        <TextField
          label="장소"
          maxLength={255}
          autoComplete="off"
          placeholder={LOCATION_PLACEHOLDER[meetingType] ?? LOCATION_PLACEHOLDER.FLEXIBLE}
          error={errors.location?.message}
          {...register("location")}
        />
      </div>
    </>
  );
}

export function ReadOnlyFact({ label, value }) {
  return (
    <div className="group-editor__fact group-editor__fact--readonly">
      <span className="group-editor__fact-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DayChip({ day, label, register, short }) {
  const tone = day === "SATURDAY" ? " is-saturday" : day === "SUNDAY" ? " is-sunday" : "";
  return (
    <label className={`group-editor__day-chip${tone}`}>
      {/* The chip shows 월 but must announce 월요일, so the name lives on the input. */}
      <input aria-label={label} type="checkbox" value={day} {...register("daysOfWeek")} />
      <span aria-hidden="true">{short}</span>
    </label>
  );
}

export function RecurringScheduleFields({
  errors,
  onQuickSelect,
  register,
  selectedDays = []
}) {
  const flexible = selectedDays.length === 0;

  return (
    <fieldset className="group-editor__schedule-fields">
      <legend className="group-editor__visually-hidden">활동 일정</legend>

      <div className="group-editor__quick-days" aria-label="요일 빠른 선택" role="group">
        {QUICK_PRESETS.map(([label, days]) => {
          const active = sameDays(selectedDays, days);
          return (
            <button
              aria-pressed={active}
              className={active ? "is-active" : ""}
              key={label}
              onClick={() => onQuickSelect(active ? [] : days)}
              type="button"
            >
              {label}
            </button>
          );
        })}
        <span className="group-editor__quick-divide" aria-hidden="true" />
        <button
          aria-pressed={flexible}
          className={`group-editor__quick-flexible${flexible ? " is-active" : ""}`}
          onClick={() => onQuickSelect([])}
          type="button"
        >
          유동적
        </button>
      </div>

      <div className="group-editor__day-grid" aria-label="활동 요일" role="group">
        {DAYS.map(([day, label, short]) => (
          <DayChip day={day} key={day} label={label} register={register} short={short} />
        ))}
      </div>

      {flexible ? (
        <p className="group-editor__schedule-flexible-note">
          요일을 고르지 않으면 <strong>유동적 일정</strong>으로 저장돼요. 시간은 사용하지 않아요.
        </p>
      ) : null}

      {errors.daysOfWeek?.message ? (
        <p className="group-editor__error" role="alert">
          {errors.daysOfWeek.message}
        </p>
      ) : null}

      <div className="group-editor__time-grid">
        <TextField
          label="시작 시간"
          type="time"
          error={errors.startTime?.message}
          {...register("startTime")}
        />
        <TextField
          label="종료 시간"
          type="time"
          error={errors.endTime?.message}
          {...register("endTime")}
        />
      </div>
    </fieldset>
  );
}

export function SessionScheduleFields({ errors, register }) {
  return (
    <fieldset className="group-editor__schedule-fields">
      <legend className="group-editor__visually-hidden">한 번 만나는 일정</legend>
      <TextField
        label="진행 날짜"
        type="date"
        error={errors.sessionDate?.message}
        {...register("sessionDate")}
      />
      <div className="group-editor__time-grid">
        <TextField
          label="시작 시간"
          type="time"
          error={errors.startTime?.message}
          {...register("startTime")}
        />
        <TextField
          label="종료 시간"
          type="time"
          error={errors.endTime?.message}
          {...register("endTime")}
        />
      </div>
    </fieldset>
  );
}
