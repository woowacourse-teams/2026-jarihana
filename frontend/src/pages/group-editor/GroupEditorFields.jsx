import { Checkbox, MarkdownContent, Select, Textarea, TextField } from "../../shared/ui/index.js";

export const DAYS = [
  ["MONDAY", "월요일"],
  ["TUESDAY", "화요일"],
  ["WEDNESDAY", "수요일"],
  ["THURSDAY", "목요일"],
  ["FRIDAY", "금요일"],
  ["SATURDAY", "토요일"],
  ["SUNDAY", "일요일"]
];

export const MARKDOWN_TOOLS = [
  ["H2", "\n## 소제목\n"],
  ["B", " **강조할 내용** "],
  ["• 목록", "\n- 항목\n"],
  ["“ 인용", "\n> 인용문\n"],
  ["⌁ 링크", " [링크 이름](https://) "]
];

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

export function MarkdownToolbar({ onInsert }) {
  return (
    <div className="group-editor__markdown-toolbar" aria-label="Markdown 서식" role="toolbar">
      {MARKDOWN_TOOLS.map(([label, snippet]) => (
        <button key={label} onClick={() => onInsert(snippet)} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}

export function MarkdownPreview({ value }) {
  return (
    <div className="group-editor__markdown-preview" aria-label="모임 소개 미리보기">
      <MarkdownContent value={value} emptyText="작성한 소개가 여기에 표시돼요." />
    </div>
  );
}

export function DescriptionField({
  description = "모임의 목표와 진행 방식을 알려 주세요. 최대 5,000자",
  error,
  label = "상세 소개",
  register,
  rows = 9
}) {
  return (
    <Textarea
      label={label}
      description={description}
      rows={rows}
      maxLength={5000}
      error={error}
      {...register("description")}
    />
  );
}

export function OverviewFields({
  className = "",
  errors,
  register,
  showDescription = true,
  showType = false
}) {
  return (
    <div className={`group-editor__overview-fields ${className}`.trim()}>
      {showType ? (
        <Select label="모임 종류" error={errors.type?.message} {...register("type")}>
          <option value="STUDY">스터디</option>
          <option value="CLUB">동아리</option>
          <option value="SESSION">세션</option>
        </Select>
      ) : null}
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
      {showDescription ? (
        <DescriptionField error={errors.description?.message} register={register} />
      ) : null}
    </div>
  );
}

export function RecurringScheduleFields({ errors, register, compact = false }) {
  return (
    <fieldset className="group-editor__schedule-fields">
      <legend>{compact ? "정기 일정" : "매주 만나는 일정"}</legend>
      <p className="group-editor__field-note">활동 요일을 모두 선택해 주세요.</p>
      <div className="group-editor__day-grid">
        {DAYS.map(([value, label]) => (
          <Checkbox key={value} label={label} value={value} {...register("daysOfWeek")} />
        ))}
      </div>
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
      <legend>한 번 만나는 일정</legend>
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
