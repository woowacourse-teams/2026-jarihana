import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { createAnnouncement, fetchAnnouncement, fetchAnnouncements } from "./api.js";

export const announcementKeys = {
  all: ["group-announcements"],
  lists: (groupId) => ["group-announcements", groupId, "list"],
  list: (groupId, memberId, sessionVersion) => [
    "group-announcements", groupId, "list", memberId ?? null, sessionVersion ?? 0
  ],
  detail: (groupId, announcementId, memberId, sessionVersion) => [
    "group-announcements", groupId, "detail", memberId ?? null, sessionVersion ?? 0,
    announcementId
  ]
};

export function useAnnouncementList(groupId, memberId, sessionVersion) {
  return useInfiniteQuery({
    queryKey: announcementKeys.list(groupId, memberId, sessionVersion),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => fetchAnnouncements(groupId, pageParam, signal),
    getNextPageParam: getSafeNextCursor,
    enabled: Boolean(groupId),
    gcTime: 0,
    refetchOnMount: "always"
  });
}

export function useAnnouncementDetail(groupId, announcementId, memberId, sessionVersion) {
  return useQuery({
    queryKey: announcementKeys.detail(groupId, announcementId, memberId, sessionVersion),
    queryFn: ({ signal }) => fetchAnnouncement(groupId, announcementId, signal),
    enabled: Boolean(groupId && announcementId),
    staleTime: 0,
    gcTime: 0,
    retry: false
  });
}

export function useCreateAnnouncement(groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => createAnnouncement(groupId, values),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: announcementKeys.lists(groupId)
    })
  });
}
