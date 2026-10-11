import { useState } from "react";

import { useAuth } from "../../features/auth/index.js";
import { useCreateGroupEvent, useDeleteGroupEvent, useGroupCalendar, useGroupCalendarEventDetail, useSetGroupCalendarVisibility, useUpdateGroupEvent } from "../../features/group/index.js";
import { GroupCalendar } from "./GroupCalendar.jsx";
import { GroupCalendarDetailDialog } from "./GroupCalendarDetailDialog.jsx";
import { GroupCalendarEventDialog } from "./GroupCalendarEventDialog.jsx";
import { GroupRecurringManageDialog } from "./GroupRecurringManageDialog.jsx";
import { GroupSessionManageDialog } from "./GroupSessionManageDialog.jsx";

export function GroupCalendarTab({ groupId, isLeader = false, isMember = false, sessionSchedule = null }) {
  const [range, setRange] = useState(null);
  const [createDate, setCreateDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const auth = useAuth();
  const viewerId = (auth.member ?? auth.user)?.id;
  const hasDetailAccess = Boolean(isMember && viewerId && auth.status === "authenticated");
  const calendarQuery = useGroupCalendar(groupId, range);
  const createEvent = useCreateGroupEvent(groupId);
  const updateEvent = useUpdateGroupEvent(groupId);
  const deleteEvent = useDeleteGroupEvent(groupId);
  const visibility = useSetGroupCalendarVisibility(groupId);
  const detailQuery = useGroupCalendarEventDetail(groupId, selectedEvent, viewerId,
    auth.sessionVersion, hasDetailAccess);
  const manageSelected = Boolean(isLeader && selectedEvent?.kind === "RECURRING");
  const manageSession = Boolean(isLeader && selectedEvent?.kind === "SESSION");

  async function handleCreate(values) {
    try {
      await createEvent.mutateAsync(values);
      setCreateDate(null);
    } catch {
      // The modal keeps the entered values and displays the mutation error.
    }
  }

  async function handleUpdate(values) {
    try {
      await updateEvent.mutateAsync({ eventId: editEvent.id, ...values });
      setEditEvent(null);
      setSelectedEvent(null);
    } catch { /* The form remains open with the entered values. */ }
  }

  async function handleDelete() {
    try {
      await deleteEvent.mutateAsync({ eventId: selectedEvent.id, version: detailQuery.data.version });
      setSelectedEvent(null);
    } catch { /* The detail dialog displays the server error. */ }
  }

  return (
    <>
      <GroupCalendar
        calendar={calendarQuery.data}
        error={calendarQuery.error}
        isLeader={isLeader}
        loading={calendarQuery.isPending}
        onCreateEvent={isLeader ? setCreateDate : undefined}
        onEventOpen={setSelectedEvent}
        onToggleBase={isLeader ? (value) => visibility.mutate(value) : undefined}
        onRangeChange={setRange}
        onRetry={() => calendarQuery.refetch()}
        settingsError={visibility.error}
        togglePending={visibility.isPending}
      />
      <GroupCalendarEventDialog
        initialDate={createDate}
        onClose={() => { createEvent.reset(); setCreateDate(null); }}
        onSave={handleCreate}
        open={createDate !== null}
        saving={createEvent.isPending}
        serverError={createEvent.error?.userMessage || (createEvent.error ? "일정을 저장하지 못했어요. 다시 시도해 주세요." : null)}
      />
      <GroupCalendarEventDialog
        initialEvent={editEvent}
        onClose={() => { updateEvent.reset(); setEditEvent(null); }}
        onSave={handleUpdate}
        open={editEvent !== null}
        saving={updateEvent.isPending}
        serverError={updateEvent.error?.userMessage || (updateEvent.error ? "일정을 수정하지 못했어요. 다시 시도해 주세요." : null)}
      />
      <GroupCalendarDetailDialog
        detail={detailQuery.data}
        error={detailQuery.error}
        event={manageSelected || manageSession ? null : selectedEvent}
        isMember={hasDetailAccess}
        isLeader={isLeader}
        loading={detailQuery.isPending}
        onClose={() => setSelectedEvent(null)}
        onEdit={() => { setEditEvent(detailQuery.data); setSelectedEvent(null); }}
        onDelete={handleDelete}
        deleting={deleteEvent.isPending}
        deleteError={deleteEvent.error?.userMessage || (deleteEvent.error ? "일정을 삭제하지 못했어요. 다시 시도해 주세요." : null)}
      />
      <GroupRecurringManageDialog
        event={manageSelected ? selectedEvent : null}
        groupId={groupId}
        location={detailQuery.data?.location}
        onClose={() => setSelectedEvent(null)}
      />
      {manageSession ? <GroupSessionManageDialog
        groupId={groupId}
        onClose={() => setSelectedEvent(null)}
        open={manageSession}
        schedule={sessionSchedule}
      /> : null}
    </>
  );
}
