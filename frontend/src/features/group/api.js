import {
  groupCreateResponseSchema,
  groupCalendarSchema,
  groupEventDetailSchema,
  groupScheduleDetailSchema,
  groupRecurringManageSchema,
  groupRecurringPeriodSchema,
  groupVersionSchema,
  groupCalendarSettingsSchema,
  groupDetailSchema,
  groupListPageSchema,
  groupTerminateResponseSchema,
  recurringScheduleSchema,
  sessionScheduleSchema
} from "../../entities/group/index.js";
import { apiRequest } from "../../shared/api/index.js";

export function buildGroupSearchParams(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      return typeof value !== "string" || value.trim().length > 0;
    })
  );
}

export function fetchGroups(filters = {}) {
  return apiRequest("groups", {
    searchParams: buildGroupSearchParams(filters),
    schema: groupListPageSchema
  });
}

export function fetchGroup(groupId) {
  return apiRequest(`groups/${groupId}`, { schema: groupDetailSchema });
}

export function fetchGroupCalendar(groupId, range) {
  return apiRequest(`groups/${groupId}/calendar`, {
    searchParams: range,
    schema: groupCalendarSchema
  });
}

export function createGroupEvent(groupId, values) {
  return apiRequest(`groups/${groupId}/events`, {
    method: "post",
    json: values,
    schema: groupEventDetailSchema
  });
}

export function fetchGroupEventDetail(groupId, eventId) {
  return apiRequest(`groups/${groupId}/events/${eventId}`, { schema: groupEventDetailSchema });
}

export function updateGroupEvent(groupId, eventId, values) {
  return apiRequest(`groups/${groupId}/events/${eventId}`, {
    method: "put", json: values, schema: groupEventDetailSchema
  });
}

export function deleteGroupEvent(groupId, eventId, version) {
  return apiRequest(`groups/${groupId}/events/${eventId}`, {
    method: "delete", searchParams: { version }
  });
}

export function fetchGroupScheduleDetail(groupId, kind, date) {
  return apiRequest(`groups/${groupId}/calendar/schedule-details`, {
    searchParams: { kind, date },
    schema: groupScheduleDetailSchema
  });
}

export function fetchGroupRecurringManage(groupId) {
  return apiRequest(`groups/${groupId}/recurring-schedule/manage`, {
    schema: groupRecurringManageSchema
  });
}

export function registerGroupRecurringSeries(groupId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/series`, {
    method: "post", json: values, schema: groupRecurringManageSchema
  });
}

export function fetchGroupRecurringPeriod(groupId, periodId) {
  return apiRequest(`groups/${groupId}/recurring-schedule/periods/${periodId}`, {
    schema: groupRecurringPeriodSchema
  });
}

export function replaceScopedRecurringSchedule(groupId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/scoped`, {
    method: "put", json: values, schema: groupVersionSchema
  });
}

export function editGroupRecurringPeriod(groupId, periodId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/periods/${periodId}`, {
    method: "put", json: values, schema: groupVersionSchema
  });
}

export function updateGroupRecurringRange(groupId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/calendar-range`, {
    method: "put", json: values, schema: groupVersionSchema
  });
}

export function deleteScopedRecurringSchedule(groupId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/scoped`, {
    method: "delete", json: values
  });
}

export function createRecurringOccurrenceOverride(groupId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/occurrences`, {
    method: "post", json: values, schema: groupEventDetailSchema
  });
}

export function deleteRecurringOccurrence(groupId, values) {
  return apiRequest(`groups/${groupId}/recurring-schedule/occurrences`, {
    method: "delete", json: values
  });
}

export function setGroupCalendarVisibility(groupId, showBaseSchedule) {
  return apiRequest(`groups/${groupId}/calendar/settings`, {
    method: "put",
    json: { showBaseSchedule },
    schema: groupCalendarSettingsSchema
  });
}

export function createGroup(values) {
  return apiRequest("groups", { method: "post", json: values, schema: groupCreateResponseSchema });
}

export function modifyGroup(groupId, values) {
  return apiRequest(`groups/${groupId}`, {
    method: "put",
    json: values,
    schema: groupDetailSchema
  });
}

export function deleteGroup(groupId) {
  return apiRequest(`groups/${groupId}`, { method: "delete" });
}

export function terminateGroup(groupId) {
  return apiRequest(`groups/${groupId}`, {
    method: "patch",
    json: { status: "ENDED" },
    schema: groupTerminateResponseSchema
  });
}

export function replaceRecurringSchedule(groupId, schedule) {
  return apiRequest(`groups/${groupId}/recurring-schedule`, {
    method: "put",
    json: schedule,
    schema: recurringScheduleSchema
  });
}

export function removeRecurringSchedule(groupId) {
  return apiRequest(`groups/${groupId}/recurring-schedule`, { method: "delete" });
}

export function replaceSessionSchedule(groupId, schedule) {
  return apiRequest(`groups/${groupId}/session-schedule`, {
    method: "put",
    json: schedule,
    schema: sessionScheduleSchema
  });
}
