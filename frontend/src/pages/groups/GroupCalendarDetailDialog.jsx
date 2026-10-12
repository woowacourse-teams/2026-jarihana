import { useState } from "react";

import { Modal } from "../../shared/ui/index.js";

function displayDate(event) {
  return event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} – ${event.endDate}`;
}

function displayTime(event) {
  if (event.allDay) return "종일";
  if (!event.startTime) return null;
  return event.endTime
    ? `${event.startTime.slice(0, 5)}–${event.endTime.slice(0, 5)}`
    : event.startTime.slice(0, 5);
}

function statusLabel(status) {
  if (status === "UPCOMING") return "예정";
  if (status === "COMPLETED") return "개최 완료";
  return null;
}

export function GroupCalendarDetailDialog({ event, isMember, isLeader, detail, loading, error, onClose, onEdit, onDelete, deleting, deleteError }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  function close() { setConfirmDelete(false); onClose(); }
  return (
    <Modal closeAction="group_calendar_detail_dismiss" onClose={close} open={Boolean(event)} title={event?.title ?? "일정"}>
      {event ? (
        <div className="group-calendar-detail">
          <p>{displayDate(event)}{displayTime(event) ? ` · ${displayTime(event)}` : ""}</p>
          {!isMember ? <p>장소와 설명은 모임원에게만 보여요.</p> : null}
          {isMember && loading ? <p role="status">상세 내용을 불러오는 중이에요.</p> : null}
          {isMember && error ? <p role="alert">상세 내용을 불러오지 못했어요.</p> : null}
          {(event.kind === "REGULAR_MEETING" || event.kind === "RECURRING" && event.id != null)
            && isMember && statusLabel(detail?.effectiveStatus)
            ? <p><strong>상태</strong> {statusLabel(detail.effectiveStatus)}</p> : null}
          {isMember && detail?.location ? <p><strong>장소</strong> {detail.location}</p> : null}
          {isMember && detail?.description ? <p className="group-calendar-detail__description">{detail.description}</p> : null}
          {isLeader && ["GROUP_EVENT", "REGULAR_MEETING"].includes(event.kind) && detail ? <div className="group-calendar-form__actions">
            <button data-ph-capture-attribute-action="group_calendar_event_edit" onClick={onEdit} type="button">일정 수정</button>
            {confirmDelete ? <>
              <button data-ph-capture-attribute-action="group_calendar_event_delete_cancel" onClick={() => setConfirmDelete(false)} type="button">취소</button>
              <button data-ph-capture-attribute-action="group_calendar_event_delete_confirm" disabled={deleting} onClick={onDelete} type="button">삭제 확정</button>
            </> : <button data-ph-capture-attribute-action="group_calendar_event_delete_open" onClick={() => setConfirmDelete(true)} type="button">일정 삭제</button>}
          </div> : null}
          {deleteError ? <p className="group-calendar-form__error" role="alert">{deleteError}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}
