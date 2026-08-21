import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { groupKeys } from "../group/index.js";
import { closeRecruitment, createRecruitment, fetchRecruitment, fetchRecruitments } from "./api.js";

export const recruitmentKeys = {
  all: ["recruitments"],
  lists: () => ["recruitments", "list"],
  list: (groupId) => ["recruitments", "list", groupId],
  detail: (groupId, recruitmentId) => ["recruitments", "detail", groupId, recruitmentId]
};

export function useInfiniteRecruitments(groupId) {
  return useInfiniteQuery({
    queryKey: recruitmentKeys.list(groupId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchRecruitments(groupId, { cursor: pageParam }),
    getNextPageParam: getSafeNextCursor,
    enabled: Boolean(groupId)
  });
}

export function useRecruitment(groupId, recruitmentId) {
  return useQuery({
    queryKey: recruitmentKeys.detail(groupId, recruitmentId),
    queryFn: () => fetchRecruitment(groupId, recruitmentId),
    enabled: Boolean(groupId) && Boolean(recruitmentId)
  });
}

function invalidateRecruitments(queryClient, groupId) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: recruitmentKeys.list(groupId) }),
    queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
    queryClient.invalidateQueries({ queryKey: groupKeys.lists() })
  ]);
}

export function useCreateRecruitment(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => createRecruitment(groupId, values),
    onSuccess: () => invalidateRecruitments(queryClient, groupId)
  });
}

export function useCloseRecruitment(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recruitmentId }) => closeRecruitment(groupId, recruitmentId),
    onSuccess: (_data, { recruitmentId }) =>
      Promise.all([
        invalidateRecruitments(queryClient, groupId),
        queryClient.invalidateQueries({
          queryKey: recruitmentKeys.detail(groupId, recruitmentId)
        })
      ])
  });
}
