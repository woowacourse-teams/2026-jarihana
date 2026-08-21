import {
  groupCreateResponseSchema,
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
