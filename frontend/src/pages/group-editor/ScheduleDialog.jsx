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

/*
 * 요일을 대신 눌러 주는 액션이다. 상태를 가진 선택지가 아니므로 aria-pressed를 두지
 * 않는다. 지금 무엇이 골라져 있는지는 아래 요일 칩만 말한다.
 */
const BULK_SELECTIONS = [
  ["weekday", "평일", WEEKDAYS],
  ["weekend", "주말", WEEKENDS],
  ["everyday", "매일", EVERY_DAY],
  ["clear", "모두 지우기", []]
];

function DayChip({ day, label, register, short }) {
  const tone = day === "SATURDAY" || day === "SUNDAY" ? " is-weekend" : "";
  return (
    <label className={`group-editor__day-chip${tone}`}>
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
  return (
    <fieldset className="group-editor__schedule-fields">
      <legend className="group-editor__visually-hidden">활동 일정</legend>

      {/*
        * 요일이 먼저고 일괄 선택은 그 아래 도구다. 위에 세그먼트로 두면 요일과
        * 시간을 거느리는 상위 분류처럼 읽힌다.
        */}
      <p className="group-editor__field-label">활동 요일</p>
      <div aria-label="활동 요일" className="group-editor__day-grid" role="group">
        {DAYS.map(([day, label, short]) => (
          <DayChip day={day} key={day} label={label} register={register} short={short} />
        ))}
      </div>

      <div aria-label="요일 일괄 선택" className="group-editor__bulk" role="group">
        <span className="group-editor__bulk-label">한 번에</span>
        {BULK_SELECTIONS.map(([key, label, days]) => (
          <button
            className={key === "clear" ? "is-quiet" : undefined}
            key={key}
            onClick={() => onPresetSelect(days)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/*
        * 요일이 없으면 일정 자체가 유동적이라 시간이 쓰이지 않는다. 요일 칩은 남겨
        * 개별 요일부터 다시 고를 수 있게 하되, 시간 칸은 통째로 내린다.
        */}
      {selectedDays.length === 0 ? (
        <p className="group-editor__schedule-note">
          요일을 고르지 않으면 <strong>유동적 일정</strong>이에요. 정해진 요일과 시간 없이 그때그때
          정하는 모임입니다.
        </p>
      ) : (
        <>
          <p className="group-editor__field-label">활동 시간</p>
          <label className="group-editor__time-check">
            <input
              checked={flexibleTime}
              onChange={(event) => onFlexibleTimeChange?.(event.currentTarget.checked)}
              type="checkbox"
            />
            시간은 그때그때 정해요
          </label>

          {/*
            * 시간만 유동적이면 두 시각을 비워 보낸다. 입력은 자리를 지키되 잠가서
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
        </>
      )}
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
