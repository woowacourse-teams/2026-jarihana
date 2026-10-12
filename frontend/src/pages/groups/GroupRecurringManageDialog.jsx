import { useState } from "react";

import { useAuth } from "../../features/auth/index.js";
import {
  useDeleteScopedRecurringSchedule,
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
  ["FROM_TODAY", "이 이후의 일정까지"]
];

function sourceDateOf(event) {
  const keyDate = event?.occurrenceKey?.split(":").at(-1);
  return event?.recurrenceSourceDate ?? (/^\d{4}-\d{2}-\d{2}$/.test(keyDate ?? "") ? keyDate : event?.startDate);
}

function seriesIdOf(event) {
  return /^recurring:(\d+):/.exec(event?.occurrenceKey ?? "")?.[1] ?? null;
}

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function errorCopy(error) {
  return error?.userMessage || (error ? "저장하지 못했어요. 다시 시도해 주세요." : null);
}

function RuleForm({ source, event, detail, groupType, seriesVersion, onSave, saving, error,
  onSaveOccurrence, occurrenceSaving, occurrenceError }) {
  const [days, setDays] = useState(source.daysOfWeek);
  const [timeEnabled, setTimeEnabled] = useState(Boolean(source.startTime));
  const [startTime, setStartTime] = useState(source.startTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(source.endTime?.slice(0, 5) ?? "");
  const [scope, setScope] = useState("");
  const [validation, setValidation] = useState("");
  const scopes = event ? [...SCOPES, ["THIS_EVENT", "이 일정만"]] : SCOPES;
  const scopeDate = sourceDateOf(event) ?? todayInSeoul();
  const scopeAnchor = event ? `선택한 날짜(${scopeDate})` : scopeDate;

  function toggleDay(day) {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  }

  function submit(submitEvent) {
    submitEvent.preventDefault();
    if (days.length === 0) return setValidation("요일을 하나 이상 선택해 주세요.");
    if (timeEnabled && (!startTime || !endTime || startTime >= endTime)) {
      return setValidation("종료 시각은 시작 시각보다 뒤여야 해요.");
    }
    if (!scope || scope === "THIS_EVENT") return setValidation("변경할 일정 범위를 선택해 주세요.");
    setValidation("");
    onSave({
      daysOfWeek: days,
      startTime: timeEnabled ? startTime : null,
      endTime: timeEnabled ? endTime : null,
      applyScope: scope,
      ...(scope === "FROM_TODAY"
        ? { fromDate: scopeDate }
        : {}),
      ...(event ? { periodId: event.periodId } : {}),
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
    <fieldset className="group-recurring-form__scopes">
      <legend>변경 범위</legend>
      {scopes.map(([value, label]) => (
        <label key={value}><input checked={scope === value} data-ph-capture-attribute-action={value === "THIS_EVENT" ? "group_calendar_recurring_this_event_select" : "group_calendar_recurring_scope_select"} name="ruleScope" onChange={() => { setScope(value); setValidation(""); }} type="radio" />{label}</label>
      ))}
    </fieldset>
    {scope === "FROM_TODAY" ? <p className="group-calendar-form__notice">{scopeAnchor}부터 정기 일정에 적용합니다.</p> : null}
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
    <p className="group-calendar-form__notice">종료일을 비우면 계속 표시됩니다. 표시 기간 밖의 정기 일정은 달력에 나타나지 않아요.</p>
    {validation || error ? <p className="group-calendar-form__error" role="alert">{validation || error}</p> : null}
    <div className="group-calendar-form__actions"><Button disabled={saving} type="submit">표시 기간 저장</Button></div>
  </form>;
}

function DeleteRuleSection({ event, onDelete, saving, error }) {
  const [scope, setScope] = useState("");
  const [confirming, setConfirming] = useState(false);
  const scopeDate = sourceDateOf(event) ?? todayInSeoul();
  const scopeAnchor = event ? `선택한 날짜(${scopeDate})` : scopeDate;
  return <div className="group-recurring-form group-recurring-form__delete">
    <h3>정기 일정 삭제</h3>
    <label>삭제 범위
      <select data-ph-capture-attribute-action="group_calendar_recurring_delete_scope_select" onChange={(event) => { setScope(event.currentTarget.value); setConfirming(false); }} value={scope}>
        <option value="">범위 선택</option>
        {(event ? [...SCOPES, ["THIS_EVENT", "이 일정만"]] : SCOPES)
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {scope === "FROM_TODAY" ? <p className="group-calendar-form__notice">{scopeAnchor}부터 정기 일정을 삭제합니다.</p> : null}
    {error ? <p className="group-calendar-form__error" role="alert">{error}</p> : null}
    {confirming ? <div className="group-calendar-form__actions">
      <Button data-ph-capture-attribute-action="group_calendar_recurring_delete_cancel" onClick={() => setConfirming(false)} type="button" variant="secondary">취소</Button>
      <Button data-ph-capture-attribute-action="group_calendar_recurring_delete_confirm" disabled={saving} onClick={() => onDelete(scope)} type="button" variant="danger">삭제 확정</Button>
    </div> : <div className="group-calendar-form__actions">
      <Button data-ph-capture-attribute-action="group_calendar_recurring_delete_open" disabled={!scope} onClick={() => setConfirming(true)} type="button" variant="danger">정기 일정 삭제</Button>
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
  const range = useUpdateGroupRecurringRange(groupId);
  const deletion = useDeleteScopedRecurringSchedule(groupId);
  const eventSeriesId = seriesIdOf(event);
  const isCurrentSeries = current || (manage.data && (eventSeriesId
    ? eventSeriesId === String(manage.data.seriesId)
    : manage.data.periodId === event?.periodId));
  const source = event
    ? period.data ?? (manage.data?.periodId === event.periodId ? manage.data : null)
    : manage.data;

  function close() {
    replace.reset(); range.reset(); deletion.reset(); onClose();
  }

  async function saveRule(values) {
    try {
      await replace.mutateAsync(values);
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
        await deletion.mutateAsync({
          applyScope: scope,
          ...(scope === "FROM_TODAY" ? { fromDate: sourceDateOf(event) ?? todayInSeoul() } : {}),
          ...(event ? { periodId: event.periodId } : {}),
          version: source.version
        });
      }
      close();
    }
    catch { /* Keep the form open with its inputs intact. */ }
  }

  return <Modal closeAction="group_recurring_manage_dismiss" onClose={close} open={open} panelClassName="ui-dialog--group-recurring-manage" title="정기 일정 관리">
    {open ? <div className="group-recurring-dialog">
      {event ? <p>{event.startDate}{event.startTime ? ` · ${event.startTime.slice(0, 5)}` : ""}</p> : null}
      {location ? <p><strong>당시 장소</strong> {location}</p> : null}
      {!source && (manage.isPending || period.isPending) ? <p role="status">규칙을 불러오는 중이에요.</p> : null}
      {!source && period.error ? <p role="alert">규칙을 불러오지 못했어요.</p> : null}
      {!source && manage.error && !event ? <p role="alert">현재 규칙을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.</p> : null}
      {source ? <RuleForm
        error={errorCopy(replace.error)}
        detail={detail}
        event={event}
        groupType={groupType}
        key={`${source.periodId}:${source.version}:${event?.occurrenceKey ?? event?.id ?? "manage"}`}
        onSave={saveRule}
        onSaveOccurrence={onSaveOccurrence}
        occurrenceError={occurrenceError}
        occurrenceSaving={occurrenceSaving}
        saving={replace.isPending}
        seriesVersion={source.version}
        source={source}
      /> : null}
      {isCurrentSeries && manage.data ? <>
        <RangeForm error={errorCopy(range.error)} key={`range:${manage.data.version}`}
          manage={manage.data} onSave={saveRange} saving={range.isPending} />
      </> : null}
      {source && (current || event) ? <DeleteRuleSection
        error={errorCopy(occurrenceDeleteError || deletion.error)}
        event={event}
        onDelete={deleteRule}
        saving={deletion.isPending || occurrenceDeleting}
      /> : null}
    </div> : null}
  </Modal>;
}
