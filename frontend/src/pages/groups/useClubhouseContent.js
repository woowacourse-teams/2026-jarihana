import { useEffect, useMemo } from "react";

import { useInfiniteActivityPosts } from "../../features/activity-post/hooks.js";
import { useAnnouncementList } from "../../features/announcement/hooks.js";

function contentStatus(query, authReady) {
  if (!authReady || query.isPending) return "loading";
  if ([401, 403].includes(query.error?.status)) return "denied";
  if (query.isError) return "error";
  return "ready";
}

export function useClubhouseContent(groupId, auth, pinnedIds = [], enabled = true) {
  const authReady = enabled && auth.status !== "loading" && !auth.logoutPending;
  const viewerKey = auth.status === "authenticated" ? auth.member?.id ?? "authenticated" : auth.status;
  const activities = useInfiniteActivityPosts({ groupId, viewerKey, enabled: authReady });
  const notices = useAnnouncementList(groupId, auth.member?.id, auth.sessionVersion, authReady);
  const activityStatus = contentStatus(activities, authReady);
  const announcementStatus = contentStatus(notices, authReady);
  const posts = useMemo(() => activities.data?.pages.flatMap((page) => page.items) ?? [], [activities.data]);
  const hasMissingPin = pinnedIds.some((id) => !posts.some((post) => String(post.id) === String(id)));
  const { fetchNextPage, hasNextPage, isFetching, isError } = activities;

  // Saved frames can point beyond the first page of the existing activity feed.
  useEffect(() => {
    if (authReady && hasMissingPin && hasNextPage && !isFetching && !isError) {
      void fetchNextPage();
    }
  }, [authReady, hasMissingPin, hasNextPage, isFetching, isError, fetchNextPage]);

  const exhibit = useMemo(() => ({
    status: activityStatus,
    records: activityStatus === "ready" ? posts.map((post) => ({
      id: post.id,
      title: post.caption?.trim() || "함께한 활동",
      content: post.caption || "",
      photo: post.imageUrl,
      createdAt: post.createdAt,
      activityDate: post.activityDate,
      author: { name: post.authorNickname },
      link: `/groups/${groupId}?tab=activities&post=${post.id}`
    })) : []
  }), [activityStatus, posts, groupId]);
  const announcements = useMemo(() => ({
    status: announcementStatus,
    records: announcementStatus === "ready" ? notices.data?.pages.flatMap((page) => page.items) ?? [] : []
  }), [announcementStatus, notices.data]);

  return { exhibit, retryExhibit: activities.refetch, announcements, retryAnnouncements: notices.refetch };
}
