import { useState } from "react";

import { Button, Modal, Textarea, TextField } from "../../shared/ui/index.js";

function maxEventEndDate(startDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return undefined;
  const [year, month, day] = startDate.split("-").map(Number);
  const nextYear = year + 1;
  const leapYear = nextYear % 4 === 0 && (nextYear % 100 !== 0 || nextYear % 400 === 0);
  const lastDay = month === 2 && day === 29 && !leapYear ? 28 : day;
  return `${String(nextYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function GroupCalendarEventForm({ groupType = "CLUB", initialDate, initialEvent, fixedEventType, initialMode,
  onSave, saveDisabled = false, saving = false, serverError = null }) {
  const isEditing = Boolean(initialEvent?.id);
  const [mode, setMode] = useState(initialMode ?? (isEditing ? (initialEvent.allDay ? "all-day" : "timed") : ""));
  const [eventType, setEventType] = useState(fixedEventType ?? initialEvent?.eventType ?? "INDIVIDUAL");
  const [status, setStatus] = useState(initialEvent?.status ?? "AUTO");
  const [formError, setFormError] = useState("");
  const [startDate, setStartDate] = useState(initialEvent?.startDate ?? initialDate ?? "");
  const [endDate, setEndDate] = useState(initialEvent?.endDate ?? initialDate ?? "");
  const [startTime, setStartTime] = useState(initialEvent?.startTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(initialEvent?.endTime?.slice(0, 5) ?? "");
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");

  function submit(formEvent) {
    formEvent.preventDefault();
    if (saveDisabled) return;
    const isRegularMeeting = eventType === "REGULAR_MEETING";
    if (!mode) {
      setFormError("종일 또는 시간 지정을 선택해 주세요.");
      return;
    }
    if ((!isRegularMeeting && !title.trim()) || !description.trim()) {
      setFormError(isRegularMeeting ? "설명을 입력해 주세요." : "제목과 설명을 입력해 주세요.");
      return;
    }
    const submittedEndDate = isRegularMeeting ? startDate : endDate;
    if (!startDate || !submittedEndDate || submittedEndDate < startDate) {
      setFormError("종료 날짜를 시작 날짜와 같거나 그 이후로 정해 주세요.");
      return;
    }
    if (!isRegularMeeting && submittedEndDate > maxEventEndDate(startDate)) {
      setFormError("개별 일정은 시작일부터 1년 이내로 설정해 주세요.");
      return;
    }
    if (mode === "timed" && (!startTime || !endTime ||
      (startDate === submittedEndDate && endTime <= startTime))) {
      setFormError("종료 시각을 시작 시각보다 뒤로 정해 주세요.");
      return;
    }
    setFormError("");
    onSave?.({
      eventType,
      status: isRegularMeeting ? status : "AUTO",
      title: isRegularMeeting ? "정기 모임" : title.trim(),
      startDate,
      endDate: submittedEndDate,
      allDay: mode === "all-day",
      startTime: mode === "timed" ? startTime : null,
      endTime: mode === "timed" ? endTime : null,
      location: location.trim() || null,
      description: description.trim(),
      ...(isEditing ? { version: initialEvent.version } : {})
    });
  }

  return (
    <form className="group-calendar-form" noValidate onSubmit={submit}>
      {!fixedEventType ? <fieldset className="group-calendar-form__mode">
        <legend>일정 종류 <span aria-hidden="true">*</span></legend>
        <label><input checked={eventType === "INDIVIDUAL"} data-ph-capture-attribute-action="group_calendar_event_individual_select" name="eventType" onChange={() => { setEventType("INDIVIDUAL"); setStatus("AUTO"); }} type="radio" />개별 일정</label>
        {groupType !== "SESSION" ? <label><input checked={eventType === "REGULAR_MEETING"} data-ph-capture-attribute-action="group_calendar_event_regular_meeting_select" name="eventType" onChange={() => { setEventType("REGULAR_MEETING"); setStatus(initialEvent?.status ?? "AUTO"); }} type="radio" />정기 모임</label> : null}
      </fieldset> : null}
      {eventType === "REGULAR_MEETING" ? (
        <div className="group-calendar-form__fixed-title"><span>일정 제목</span><strong>정기 모임</strong></div>
      ) : (
        <TextField data-ph-capture-attribute-action="group_calendar_event_title_change" label="일정 제목" maxLength={50} onChange={(event) => setTitle(event.currentTarget.value)} required value={title} />
      )}
      {eventType === "REGULAR_MEETING" ? <label className="group-calendar-form__status" htmlFor="group-calendar-event-status">
        <span>회차 상태</span>
        <select id="group-calendar-event-status" data-ph-capture-attribute-action="group_calendar_event_status_change" onChange={(event) => setStatus(event.currentTarget.value)} value={status}>
          <option value="AUTO">날짜 기준 자동</option>
          <option value="UPCOMING">예정</option>
          <option value="COMPLETED">개최 완료</option>
        </select>
      </label> : null}
      <fieldset className="group-calendar-form__mode">
        <legend>일정 방식 <span aria-hidden="true">*</span></legend>
        <label><input checked={mode === "all-day"} data-ph-capture-attribute-action="group_calendar_event_all_day_select" name="eventMode" onChange={() => setMode("all-day")} type="radio" />종일</label>
        <label><input checked={mode === "timed"} data-ph-capture-attribute-action="group_calendar_event_timed_select" name="eventMode" onChange={() => setMode("timed")} type="radio" />시간 지정</label>
      </fieldset>
      {eventType === "REGULAR_MEETING" ? (
        <TextField data-ph-capture-attribute-action="group_calendar_event_date_change" label="날짜" onChange={(event) => { setStartDate(event.currentTarget.value); setEndDate(event.currentTarget.value); }} required type="date" value={startDate} />
      ) : (
        <div className="group-calendar-form__row">
          <TextField data-ph-capture-attribute-action="group_calendar_event_start_date_change" label="시작일" onChange={(event) => setStartDate(event.currentTarget.value)} required type="date" value={startDate} />
          <TextField
            data-ph-capture-attribute-action="group_calendar_event_end_date_change"
            description="시작일부터 1년 이내로 설정할 수 있어요."
            label="종료일"
            max={maxEventEndDate(startDate)}
            min={startDate}
            onChange={(event) => setEndDate(event.currentTarget.value)}
            required
            type="date"
            value={endDate}
          />
        </div>
      )}
      {mode === "timed" ? (
        <div className="group-calendar-form__row">
          <TextField data-ph-capture-attribute-action="group_calendar_event_start_time_change" label="시작 시각" onChange={(event) => setStartTime(event.currentTarget.value)} required type="time" value={startTime} />
          <TextField data-ph-capture-attribute-action="group_calendar_event_end_time_change" label="종료 시각" onChange={(event) => setEndTime(event.currentTarget.value)} required type="time" value={endTime} />
        </div>
      ) : null}
      <TextField data-ph-capture-attribute-action="group_calendar_event_location_change" label="장소" maxLength={255} onChange={(event) => setLocation(event.currentTarget.value)} value={location} />
      <Textarea data-ph-capture-attribute-action="group_calendar_event_description_change" label="설명" maxLength={10000} onChange={(event) => setDescription(event.currentTarget.value)} required rows={5} value={description} />
      {formError ? <p className="group-calendar-form__error" role="alert">{formError}</p> : null}
      {saveDisabled ? <p className="group-calendar-form__notice">일정 등록은 서버 연결 후 사용할 수 있어요.</p> : null}
      {serverError ? <p className="group-calendar-form__error" role="alert">{serverError}</p> : null}
      <div className="group-calendar-form__actions"><Button data-ph-capture-attribute-action="group_calendar_event_save" disabled={saveDisabled || saving} type="submit">{saving ? "저장 중..." : isEditing ? "일정 수정" : "일정 등록"}</Button></div>
    </form>
  );
}

export function GroupCalendarEventDialog({ groupType = "CLUB", initialDate, initialEvent, onClose, onSave, open, saveDisabled = false, saving = false, serverError = null }) {
  return (
    <Modal closeAction="group_calendar_event_form_dismiss" onClose={onClose} open={open} title={initialEvent ? "일정 수정" : "일정 등록"}>
      <GroupCalendarEventForm groupType={groupType} initialDate={initialDate} initialEvent={initialEvent} key={initialEvent?.id ?? initialDate} onSave={onSave} saveDisabled={saveDisabled} saving={saving} serverError={serverError} />
    </Modal>
  );
}
