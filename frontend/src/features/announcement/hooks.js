import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { getMe } from "../auth/api.js";
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

export function useAnnouncementList(groupId, memberId, sessionVersion, authReady = true) {
  return useInfiniteQuery({
    queryKey: announcementKeys.list(groupId, memberId, sessionVersion),
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }) => {
      // Public announcement endpoints don't expose an expired optional session as 401.
      if (memberId != null) await getMe(undefined, { signal });
      return fetchAnnouncements(groupId, pageParam, signal);
    },
    getNextPageParam: getSafeNextCursor,
    enabled: Boolean(groupId && authReady),
    gcTime: 0,
    refetchOnMount: "always"
  });
}

export function useAnnouncementDetail(groupId, announcementId, memberId, sessionVersion, authReady = true) {
  return useQuery({
    queryKey: announcementKeys.detail(groupId, announcementId, memberId, sessionVersion),
    queryFn: async ({ signal }) => {
      // Resolve membership before a private announcement can be filtered as a guest.
      if (memberId != null) await getMe(undefined, { signal });
      return fetchAnnouncement(groupId, announcementId, signal);
    },
    enabled: Boolean(groupId && announcementId && authReady),
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
