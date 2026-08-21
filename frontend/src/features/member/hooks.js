import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { groupKeys } from "../group/index.js";
import { fetchMembers, signupMember, transferLeader } from "./api.js";

export const memberKeys = {
  all: ["group-members"],
  lists: () => ["group-members", "list"],
  list: (groupId) => ["group-members", "list", groupId]
};

export function useInfiniteGroupMembers(groupId) {
  return useInfiniteQuery({
    queryKey: memberKeys.list(groupId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchMembers(groupId, { cursor: pageParam }),
    getNextPageParam: getSafeNextCursor,
    enabled: Boolean(groupId)
  });
}

export function useTransferLeader(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupMemberId }) => transferLeader(groupId, groupMemberId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: memberKeys.list(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
      ]);
    }
  });
}

export function useSignupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signupMember,
    onSuccess: () => queryClient.invalidateQueries()
  });
}
