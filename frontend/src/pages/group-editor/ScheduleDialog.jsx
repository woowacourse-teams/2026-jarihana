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
  allowFlexible = true,
  errors,
  onPresetSelect,
  register,
  selectedDays = []
}) {
  /* 생성 시에는 백엔드가 정기 일정을 요구하므로 유동적을 고를 수 없다. */
  const presets = allowFlexible ? PRESETS : PRESETS.filter(([key]) => key !== "flexible");
  const preset = activePreset(selectedDays);
  /*
   * 프리셋이 켜져 있으면 선택되지 않은 요일을 흐리게 둔다. 잠그지는 않는다.
   * 잠그면 평일 + 토요일 같은 조합에 아예 도달할 수 없기 때문이다.
   */
  const dimUnselected = preset !== null && preset !== "flexible";

  return (
    <fieldset className="group-editor__schedule-fields">
      <legend className="group-editor__visually-hidden">활동 일정</legend>

      <div
        aria-label="요일 일괄 선택"
        className="group-editor__preset-seg"
        role="group"
        style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}
      >
        {presets.map(([key, label, days]) => (
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
          {allowFlexible ? (
            <>
              요일을 고르지 않으면 <strong>유동적 일정</strong>으로 저장돼요.
            </>
          ) : (
            "요일을 하나 이상 골라 주세요. 만든 뒤에 유동적으로 바꿀 수 있어요."
          )}
        </p>
      ) : null}

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
  allowFlexible = true,
  errors,
  isSession,
  onClose,
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
          : "매주 반복되는 요일과 시간을 정합니다."
      }
      onClose={onClose}
      open={open}
      title="활동 일정 수정"
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
            allowFlexible={allowFlexible}
            errors={errors}
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
