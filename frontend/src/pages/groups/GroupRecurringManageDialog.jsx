import { useState } from "react";

import { useAuth } from "../../features/auth/index.js";
import {
  useDeleteScopedRecurringSchedule,
  useEditGroupRecurringPeriod,
  useGroupRecurringManage,
  useGroupRecurringPeriod,
  useReplaceScopedRecurringSchedule,
  useUpdateGroupRecurringRange
} from "../../features/group/index.js";
import { GroupCalendarEventForm } from "./GroupCalendarEventDialog.jsx";
import { Button, Modal, TextField } from "../../shared/ui/index.js";

const WEEKDAYS = [
  ["MONDAY", "월"], ["TUESDAY", "화"], ["WEDNESDAY", "수"], ["THURSDAY", "목"],
  ["FRIDAY", "금"], ["SATURDAY", "토"], ["SUNDAY", "일"]
];
const SCOPES = [
  ["ALL", "모든 일정"],
  ["PREVIOUS_RULE", "직전 일정"],
  ["FROM_TODAY", "앞으로의 일정"]
];

function sourceDateOf(event) {
  const keyDate = event?.occurrenceKey?.split(":").at(-1);
  return event?.recurrenceSourceDate ?? (/^\d{4}-\d{2}-\d{2}$/.test(keyDate ?? "") ? keyDate : event?.startDate);
}

function errorCopy(error) {
  return error?.userMessage || (error ? "저장하지 못했어요. 다시 시도해 주세요." : null);
}

function RuleForm({ source, isCurrent, event, detail, groupType, seriesVersion, onSave, saving, error,
  onSaveOccurrence, occurrenceSaving, occurrenceError }) {
  const [days, setDays] = useState(source.daysOfWeek);
  const [timeEnabled, setTimeEnabled] = useState(Boolean(source.startTime));
  const [startTime, setStartTime] = useState(source.startTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(source.endTime?.slice(0, 5) ?? "");
  const [scope, setScope] = useState(isCurrent ? "" : "RULE_PERIOD");
  const [validation, setValidation] = useState("");
  const scopes = isCurrent
    ? [...SCOPES, ...(event ? [["THIS_EVENT", "이 일정만"]] : [])]
    : event ? [["RULE_PERIOD", "선택한 규칙 구간"], ["THIS_EVENT", "이 일정만"]] : [];

  function toggleDay(day) {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  function submit(event) {
    event.preventDefault();
    if (days.length === 0) return setValidation("요일을 하나 이상 선택해 주세요.");
    if (timeEnabled && (!startTime || !endTime || startTime >= endTime)) {
      return setValidation("종료 시각은 시작 시각보다 뒤여야 해요.");
    }
    if (isCurrent && (!scope || scope === "THIS_EVENT")) return setValidation("변경할 일정 범위를 선택해 주세요.");
    setValidation("");
    onSave({
      daysOfWeek: days,
      startTime: timeEnabled ? startTime : null,
      endTime: timeEnabled ? endTime : null,
      ...(isCurrent ? { applyScope: scope } : {}),
      version: source.version
    });
  }

  const occurrenceSourceDate = sourceDateOf(event);
  const persistedOccurrence = detail?.id ? detail : null;
  const occurrence = persistedOccurrence ?? (event ? {
    eventType: "REGULAR_MEETING",
    status: "AUTO",
    title: "정기 모임",
    startDate: occurrenceSourceDate,
    endDate: occurrenceSourceDate,
    allDay: false,
    startTime: detail?.startTime ?? event.startTime,
    endTime: detail?.endTime ?? event.endTime,
    description: "",
    location: detail?.location ?? null
  } : null);

  return <section className="group-calendar-form group-recurring-form">
    <h3>반복 규칙</h3>
    {isCurrent || event ? <fieldset className="group-recurring-form__scopes">
      <legend>변경 범위</legend>
      {scopes.map(([value, label]) => (
        <label key={value}><input checked={scope === value} data-ph-capture-attribute-action={value === "THIS_EVENT" ? "group_calendar_recurring_this_event_select" : "group_calendar_recurring_scope_select"} name="ruleScope" onChange={() => { setScope(value); setValidation(""); }} type="radio" />{label}</label>
      ))}
    </fieldset> : null}
    {scope === "THIS_EVENT" && event ? <>
      <p className="group-calendar-form__notice">선택한 회차만 수정하며 반복 규칙은 그대로 유지돼요.</p>
      {persistedOccurrence || !event.id && detail ? <GroupCalendarEventForm
        fixedEventType="REGULAR_MEETING"
        groupType={groupType}
        initialDate={occurrenceSourceDate}
        initialEvent={occurrence}
        onSave={(values) => onSaveOccurrence(persistedOccurrence
          ? { eventId: persistedOccurrence.id, ...values }
          : { sourceDate: occurrenceSourceDate, periodId: event.periodId, seriesVersion, ...values })}
        saving={occurrenceSaving}
        serverError={occurrenceError}
      /> : <p role="status">회차 정보를 불러오는 중이에요.</p>}
    </> : <>
      {!isCurrent ? <p className="group-calendar-form__notice">선택한 과거 구간({source.effectiveFrom} ~ {source.effectiveUntil ?? "현재"})의 요일과 시각만 바꿉니다.</p> : null}
      <form onSubmit={submit}>
        <fieldset className="group-recurring-form__weekdays">
          <legend>반복 요일</legend>
          {WEEKDAYS.map(([value, label]) => (
            <label key={value}><input checked={days.includes(value)} onChange={() => toggleDay(value)} type="checkbox" />{label}</label>
          ))}
        </fieldset>
        <label className="group-recurring-form__time-toggle">
          <input checked={timeEnabled} onChange={(changeEvent) => setTimeEnabled(changeEvent.currentTarget.checked)} type="checkbox" /> 시각 지정
        </label>
        {timeEnabled ? <div className="group-calendar-form__row">
          <TextField label="시작 시각" onChange={(changeEvent) => setStartTime(changeEvent.currentTarget.value)} type="time" value={startTime} />
          <TextField label="종료 시각" onChange={(changeEvent) => setEndTime(changeEvent.currentTarget.value)} type="time" value={endTime} />
        </div> : null}
        {validation || error ? <p className="group-calendar-form__error" role="alert">{validation || error}</p> : null}
        <div className="group-calendar-form__actions"><Button disabled={saving} type="submit">규칙 저장</Button></div>
      </form>
    </>}
  </section>;
}

function RangeForm({ manage, onSave, saving, error }) {
  const [startDate, setStartDate] = useState(manage.startDate);
  const [endDate, setEndDate] = useState(manage.endDate ?? "");
  const [validation, setValidation] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!startDate || endDate && endDate < startDate) {
      return setValidation("종료일은 시작일과 같거나 이후여야 해요.");
    }
    setValidation("");
    onSave({ startDate, endDate: endDate || null, version: manage.version });
  }

  return <form className="group-calendar-form group-recurring-form" onSubmit={submit}>
    <h3>달력 표시 기간</h3>
    <div className="group-calendar-form__row">
      <TextField label="표시 시작일" onChange={(event) => setStartDate(event.currentTarget.value)} required type="date" value={startDate} />
      <TextField label="표시 종료일" min={startDate} onChange={(event) => setEndDate(event.currentTarget.value)} type="date" value={endDate} />
    </div>
    <p className="group-calendar-form__notice">종료일을 비우면 계속 표시됩니다. 규칙 이력의 날짜 경계는 바뀌지 않아요.</p>
    {validation || error ? <p className="group-calendar-form__error" role="alert">{validation || error}</p> : null}
    <div className="group-calendar-form__actions"><Button disabled={saving} type="submit">표시 기간 저장</Button></div>
  </form>;
}

function DeleteRuleSection({ event, isCurrent, onDelete, saving, error }) {
  const [scope, setScope] = useState("");
  const [confirming, setConfirming] = useState(false);
  return <div className="group-recurring-form group-recurring-form__delete">
    <h3>정기 일정 삭제</h3>
    <label>삭제 범위
      <select data-ph-capture-attribute-action="group_calendar_recurring_delete_scope_select" onChange={(event) => { setScope(event.currentTarget.value); setConfirming(false); }} value={scope}>
        <option value="">범위 선택</option>
        {(isCurrent ? [...SCOPES, ...(event ? [["THIS_EVENT", "이 일정만"]] : [])]
          : event ? [["THIS_EVENT", "이 일정만"]] : []).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {error ? <p className="group-calendar-form__error" role="alert">{error}</p> : null}
    {confirming ? <div className="group-calendar-form__actions">
      <button data-ph-capture-attribute-action="group_calendar_recurring_delete_cancel" onClick={() => setConfirming(false)} type="button">취소</button>
      <Button data-ph-capture-attribute-action="group_calendar_recurring_delete_confirm" disabled={saving} onClick={() => onDelete(scope)} type="button">삭제 확정</Button>
    </div> : <div className="group-calendar-form__actions">
      <button data-ph-capture-attribute-action="group_calendar_recurring_delete_open" disabled={!scope} onClick={() => setConfirming(true)} type="button">정기 일정 삭제</button>
    </div>}
  </div>;
}

export function GroupRecurringManageDialog({ event, current = false, groupId, groupType = "CLUB", detail,
  location, onSaveOccurrence, occurrenceSaving = false, occurrenceError = null, onDeleteOccurrence,
  occurrenceDeleting = false, occurrenceDeleteError = null, onClose }) {
  const open = Boolean(event || current);
  const auth = useAuth();
  const manage = useGroupRecurringManage(groupId, open, auth.member?.id, auth.sessionVersion);
  const period = useGroupRecurringPeriod(groupId, event?.periodId, open,
    auth.member?.id, auth.sessionVersion);
  const replace = useReplaceScopedRecurringSchedule(groupId);
  const edit = useEditGroupRecurringPeriod(groupId);
  const range = useUpdateGroupRecurringRange(groupId);
  const deletion = useDeleteScopedRecurringSchedule(groupId);
  const isCurrent = current || manage.data?.periodId === event?.periodId;
  const canEditPast = manage.isSuccess || manage.error?.code === "RECURRING_SCHEDULE_NOT_FOUND";
  const source = isCurrent ? manage.data : canEditPast ? period.data : null;

  function close() {
    replace.reset(); edit.reset(); range.reset(); deletion.reset(); onClose();
  }

  async function saveRule(values) {
    try {
      if (isCurrent) await replace.mutateAsync(values);
      else await edit.mutateAsync({ periodId: event.periodId, ...values });
      close();
    } catch { /* Keep the form open with its inputs intact. */ }
  }

  async function saveRange(values) {
    try { await range.mutateAsync(values); close(); }
    catch { /* Keep the form open with its inputs intact. */ }
  }

  async function deleteRule(scope) {
    try {
      if (scope === "THIS_EVENT") {
        await onDeleteOccurrence({ sourceDate: sourceDateOf(event), periodId: event.periodId,
          seriesVersion: source.version });
      } else {
        await deletion.mutateAsync({ applyScope: scope, version: manage.data.version });
      }
      close();
    }
    catch { /* Keep the form open with its inputs intact. */ }
  }

  return <Modal closeAction="group_recurring_manage_dismiss" onClose={close} open={open} title="정기 일정 관리">
    {open ? <div className="group-recurring-dialog">
      {event ? <p>{event.startDate}{event.startTime ? ` · ${event.startTime.slice(0, 5)}` : ""}</p> : null}
      {location ? <p><strong>당시 장소</strong> {location}</p> : null}
      {!source && (manage.isPending || period.isPending) ? <p role="status">규칙을 불러오는 중이에요.</p> : null}
      {!source && period.error ? <p role="alert">규칙을 불러오지 못했어요.</p> : null}
      {!source && manage.error && (current || !canEditPast) ? <p role="alert">현재 규칙을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.</p> : null}
      {source ? <RuleForm
        error={errorCopy(isCurrent ? replace.error : edit.error)}
        detail={detail}
        event={event}
        groupType={groupType}
        isCurrent={isCurrent}
        key={`${source.periodId}:${source.version}:${isCurrent}:${event?.occurrenceKey ?? event?.id ?? "manage"}`}
        onSave={saveRule}
        onSaveOccurrence={onSaveOccurrence}
        occurrenceError={occurrenceError}
        occurrenceSaving={occurrenceSaving}
        saving={replace.isPending || edit.isPending}
        seriesVersion={source.version}
        source={source}
      /> : null}
      {isCurrent && manage.data ? <>
        <RangeForm error={errorCopy(range.error)} key={`range:${manage.data.version}`}
          manage={manage.data} onSave={saveRange} saving={range.isPending} />
      </> : null}
      {source && (isCurrent || event) ? <DeleteRuleSection
        error={errorCopy(occurrenceDeleteError || deletion.error)}
        event={event}
        isCurrent={isCurrent}
        onDelete={deleteRule}
        saving={deletion.isPending || occurrenceDeleting}
      /> : null}
    </div> : null}
  </Modal>;
}
