import { Button, Modal } from "../../shared/ui/index.js";
import { UnderlineField } from "./EditorFields.jsx";

export const DAYS = [
  ["MONDAY", "월요일", "월"],
  ["TUESDAY", "화요일", "화"],
  ["WEDNESDAY", "수요일", "수"],
  ["THURSDAY", "목요일", "목"],
  ["FRIDAY", "금요일", "금"],
  ["SATURDAY", "토요일", "토"],
  ["SUNDAY", "일요일", "일"]
];

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const WEEKENDS = ["SATURDAY", "SUNDAY"];
const EVERY_DAY = [...WEEKDAYS, ...WEEKENDS];

const PRESETS = [
  ["weekday", "평일", WEEKDAYS],
  ["weekend", "주말", WEEKENDS],
  ["everyday", "매일", EVERY_DAY],
  ["flexible", "유동적", []]
];

/* 요일 프리셋과 이름이 겹치지 않도록 "시간"을 붙인다. 요일과 시간은 따로 유동적일 수 있다. */
const TIME_MODES = [
  ["fixed", "시간 지정"],
  ["flexible", "시간 유동적"]
];

function sameDays(selected, target) {
  return selected.length === target.length && target.every((day) => selected.includes(day));
}

/* 어떤 프리셋과도 맞지 않으면 null. 네 칸이 모두 꺼진 직접 선택 상태다. */
function activePreset(selected) {
  const match = PRESETS.find(([, , days]) => sameDays(selected, days));
  return match ? match[0] : null;
}

function DayChip({ day, dimmed, label, register, short }) {
  const tone = day === "SATURDAY" || day === "SUNDAY" ? " is-weekend" : "";
  return (
    <label className={`group-editor__day-chip${tone}${dimmed ? " is-dimmed" : ""}`}>
      {/* 칩은 월을 보여주지만 월요일이라고 읽혀야 하므로 이름은 input이 갖는다. */}
      <input aria-label={label} type="checkbox" value={day} {...register("daysOfWeek")} />
      <span aria-hidden="true">{short}</span>
    </label>
  );
}

export function RecurringScheduleFields({
  errors,
  flexibleTime = false,
  onFlexibleTimeChange,
  onPresetSelect,
  register,
  selectedDays = []
}) {
  const preset = activePreset(selectedDays);
  /*
   * 프리셋이 켜져 있으면 선택되지 않은 요일을 흐리게 둔다. 잠그지는 않는다.
   * 잠그면 평일 + 토요일 같은 조합에 아예 도달할 수 없기 때문이다.
   */
  const dimUnselected = preset !== null && preset !== "flexible";

  return (
    <fieldset className="group-editor__schedule-fields">
      <legend className="group-editor__visually-hidden">활동 일정</legend>

      <div aria-label="요일 일괄 선택" className="group-editor__preset-seg" role="group">
        {PRESETS.map(([key, label, days]) => (
          <button
            aria-pressed={preset === key}
            key={key}
            onClick={() => onPresetSelect(days)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/*
        * 유동적을 골라도 요일과 시간은 그대로 둔다. 감춰 보니 개별 요일부터 다시
        * 고를 길이 사라져, 평일, 주말, 매일을 거치지 않으면 정기 일정으로 돌아올 수
        * 없었다. 대신 저장되지 않는다는 사실을 아래 안내로 알린다.
        */}
      <p className="group-editor__field-label">활동 요일</p>
      <div aria-label="활동 요일" className="group-editor__day-grid" role="group">
        {DAYS.map(([day, label, short]) => (
          <DayChip
            day={day}
            dimmed={dimUnselected && !selectedDays.includes(day)}
            key={day}
            label={label}
            register={register}
            short={short}
          />
        ))}
      </div>

      {selectedDays.length === 0 ? (
        <p className="group-editor__schedule-note">
          요일을 고르지 않으면 <strong>유동적 일정</strong>이에요. 정해진 요일과 시간 없이 그때그때
          정하는 모임이라 아래 시간은 저장되지 않아요.
        </p>
      ) : null}

      <p className="group-editor__field-label">활동 시간</p>
      <div aria-label="활동 시간 선택" className="group-editor__preset-seg" role="group">
        {TIME_MODES.map(([key, label]) => (
          <button
            aria-pressed={flexibleTime === (key === "flexible")}
            key={key}
            onClick={() => onFlexibleTimeChange?.(key === "flexible")}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/*
        * 시간이 유동적이면 두 시각을 비워 보낸다. 입력은 자리를 지키되 잠가서
        * 고쳐 둔 값이 저장되는 것처럼 보이지 않게 한다.
        */}
      <div className="group-editor__time-grid">
        <UnderlineField
          disabled={flexibleTime}
          error={errors.startTime?.message}
          label="시작 시간"
          registration={register("startTime")}
          type="time"
        />
        <UnderlineField
          disabled={flexibleTime}
          error={errors.endTime?.message}
          label="종료 시간"
          registration={register("endTime")}
          type="time"
        />
      </div>
    </fieldset>
  );
}

/* 세션은 반복 일정을 가질 수 없어 요일 대신 날짜 하나를 고른다. */
export function SessionScheduleFields({ errors, register }) {
  return (
    <fieldset className="group-editor__schedule-fields">
      <legend className="group-editor__visually-hidden">한 번 만나는 일정</legend>
      <UnderlineField
        error={errors.sessionDate?.message}
        label="진행 날짜"
        registration={register("sessionDate")}
        type="date"
      />
      <div className="group-editor__time-grid">
        <UnderlineField
          error={errors.startTime?.message}
          label="시작 시간"
          registration={register("startTime")}
          type="time"
        />
        <UnderlineField
          error={errors.endTime?.message}
          label="종료 시간"
          registration={register("endTime")}
          type="time"
        />
      </div>
    </fieldset>
  );
}

export function ScheduleDialog({
  errors,
  flexibleTime,
  isSession,
  onClose,
  onFlexibleTimeChange,
  onPresetSelect,
  onSubmit,
  open,
  pending = false,
  register,
  requestError,
  selectedDays
}) {
  return (
    <Modal
      description={
        isSession
          ? "한 번만 만나는 세션이라 날짜와 시간을 정합니다."
          : "매주 반복되는 요일과 시간을 정합니다. 시간은 유동적으로 둘 수 있어요."
      }
      onClose={onClose}
      open={open}
      title="활동 일정"
    >
      <form className="group-editor__schedule-dialog" onSubmit={onSubmit} noValidate>
        {requestError ? (
          <p className="group-editor__error" role="alert">
            {requestError}
          </p>
        ) : null}
        {isSession ? (
          <SessionScheduleFields errors={errors} register={register} />
        ) : (
          <RecurringScheduleFields
            errors={errors}
            flexibleTime={flexibleTime}
            onFlexibleTimeChange={onFlexibleTimeChange}
            onPresetSelect={onPresetSelect}
            register={register}
            selectedDays={selectedDays}
          />
        )}
        <div className="group-editor__schedule-dialog-actions">
          <Button pending={pending} type="submit">
            일정 저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}
