import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import {
  createGroup,
  deleteGroup,
  fetchGroup,
  fetchGroups,
  modifyGroup,
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
  detail: (groupId) => ["groups", "detail", groupId]
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

function useGroupMutation(groupId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) })
      ]);
    }
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
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
