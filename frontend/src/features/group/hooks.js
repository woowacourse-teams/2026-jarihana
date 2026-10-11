import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { captureEvent } from "../../shared/analytics/index.js";
import {
  createGroup,
  createGroupEvent,
  updateGroupEvent,
  deleteGroupEvent,
  deleteScopedRecurringSchedule,
  deleteGroup,
  fetchGroup,
  fetchGroupCalendar,
  fetchGroupEventDetail,
  fetchGroupRecurringManage,
  registerGroupRecurringSeries,
  fetchGroupRecurringPeriod,
  fetchGroupScheduleDetail,
  fetchGroups,
  modifyGroup,
  editGroupRecurringPeriod,
  replaceScopedRecurringSchedule,
  updateGroupRecurringRange,
  setGroupCalendarVisibility,
  removeRecurringSchedule,
  replaceRecurringSchedule,
  replaceSessionSchedule,
  terminateGroup
} from "./api.js";

export const groupKeys = {
  all: ["groups"],
  lists: () => ["groups", "list"],
  list: (filters) => ["groups", "list", filters],
  details: () => ["groups", "detail"],
  detail: (groupId) => ["groups", "detail", groupId],
  calendar: (groupId, range) => ["groups", "calendar", groupId, range?.from, range?.to]
};

export function useGroups(filters = {}) {
  return useQuery({ queryKey: groupKeys.list(filters), queryFn: () => fetchGroups(filters) });
}

export function useInfiniteGroups(filters = {}) {
  return useInfiniteQuery({
    queryKey: groupKeys.list(filters),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchGroups({ ...filters, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor
  });
}

export function useGroup(groupId) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => fetchGroup(groupId),
    enabled: Boolean(groupId)
  });
}

export function useGroupCalendar(groupId, range) {
  return useQuery({
    queryKey: groupKeys.calendar(groupId, range),
    queryFn: () => fetchGroupCalendar(groupId, range),
    enabled: Boolean(groupId && range)
  });
}

export function useCreateGroupEvent(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => createGroupEvent(groupId, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups", "calendar", groupId] })
  });
}

export function useUpdateGroupEvent(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, ...values }) => updateGroupEvent(groupId, eventId, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups", "calendar", groupId] })
  });
}

export function useDeleteGroupEvent(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, version }) => deleteGroupEvent(groupId, eventId, version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups", "calendar", groupId] })
  });
}

export function useGroupCalendarEventDetail(groupId, event, viewerId, sessionVersion, enabled) {
  return useQuery({
    queryKey: ["groups", "calendar-private-detail", viewerId, sessionVersion, groupId,
      event?.kind, event?.id ?? event?.occurrenceKey],
    queryFn: () => event.kind === "GROUP_EVENT"
      ? fetchGroupEventDetail(groupId, event.id)
      : fetchGroupScheduleDetail(groupId, event.kind, event.startDate),
    enabled: Boolean(enabled && viewerId && event),
    gcTime: 0,
    staleTime: 0
  });
}

export function useGroupRecurringManage(groupId, enabled, viewerId, sessionVersion) {
  return useQuery({
    queryKey: ["groups", "recurring-manage", groupId, viewerId, sessionVersion],
    queryFn: () => fetchGroupRecurringManage(groupId),
    enabled: Boolean(groupId && enabled && viewerId),
    staleTime: 0,
    gcTime: 0
  });
}

export function useGroupRecurringPeriod(groupId, periodId, enabled, viewerId, sessionVersion) {
  return useQuery({
    queryKey: ["groups", "recurring-period", groupId, periodId, viewerId, sessionVersion],
    queryFn: () => fetchGroupRecurringPeriod(groupId, periodId),
    enabled: Boolean(groupId && periodId && enabled && viewerId),
    staleTime: 0,
    gcTime: 0
  });
}

function useRecurringMutation(groupId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["groups", "calendar", groupId] }),
      queryClient.invalidateQueries({ queryKey: ["groups", "recurring-manage", groupId] }),
      queryClient.invalidateQueries({ queryKey: ["groups", "recurring-period", groupId] }),
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
    ])
  });
}

export function useReplaceScopedRecurringSchedule(groupId) {
  return useRecurringMutation(groupId, (values) => replaceScopedRecurringSchedule(groupId, values));
}

export function useRegisterGroupRecurringSeries(groupId) {
  return useRecurringMutation(groupId, (values) => registerGroupRecurringSeries(groupId, values));
}

export function useEditGroupRecurringPeriod(groupId) {
  return useRecurringMutation(groupId, ({ periodId, ...values }) =>
    editGroupRecurringPeriod(groupId, periodId, values));
}

export function useUpdateGroupRecurringRange(groupId) {
  return useRecurringMutation(groupId, (values) => updateGroupRecurringRange(groupId, values));
}

export function useDeleteScopedRecurringSchedule(groupId) {
  return useRecurringMutation(groupId, (values) => deleteScopedRecurringSchedule(groupId, values));
}

export function useSetGroupCalendarVisibility(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visible) => setGroupCalendarVisibility(groupId, visible),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups", "calendar", groupId] })
  });
}

function useGroupMutation(groupId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
        queryClient.invalidateQueries({ queryKey: ["groups", "calendar", groupId] })
      ]);
    }
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: (group, values) => {
      captureEvent("group_created", {
        group_id: group.id,
        group_type: values.type,
        status: group.status
      });
      return queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
    }
  });
}

export function useModifyGroup(groupId) {
  return useGroupMutation(groupId, (values) => modifyGroup(groupId, values));
}

export function useDeleteGroup(groupId) {
  return useGroupMutation(groupId, () => deleteGroup(groupId));
}

export function useTerminateGroup(groupId) {
  return useGroupMutation(groupId, () => terminateGroup(groupId));
}

export function useReplaceRecurringSchedule(groupId) {
  return useGroupMutation(groupId, (schedule) => replaceRecurringSchedule(groupId, schedule));
}

export function useRemoveRecurringSchedule(groupId) {
  return useGroupMutation(groupId, () => removeRecurringSchedule(groupId));
}

export function useReplaceSessionSchedule(groupId) {
  return useGroupMutation(groupId, (schedule) => replaceSessionSchedule(groupId, schedule));
}
