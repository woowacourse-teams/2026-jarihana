import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { createActivityPost, deleteActivityPost, fetchActivityPosts, modifyActivityPost } from "./api.js";

export const activityPostKeys = {
  all: ["activityPosts"],
  feeds: () => ["activityPosts", "feed"],
  feed: ({ groupId = null, mine = false, viewerKey = "anonymous" } = {}) => [
    "activityPosts",
    "feed",
    groupId,
    mine,
    viewerKey
  ]
};

export function useInfiniteActivityPosts({ groupId, mine = false, viewerKey = "anonymous" } = {}) {
  const filters = { groupId: groupId ? String(groupId) : null, mine };
  return useInfiniteQuery({
    queryKey: activityPostKeys.feed({ ...filters, viewerKey }),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchActivityPosts({ ...filters, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor,
    placeholderData: (previousData, previousQuery) => {
      const previousQueryKey = previousQuery?.queryKey;
      const sameFeedScope = previousQueryKey?.[2] === filters.groupId;
      const sameViewer = previousQueryKey?.[4] === viewerKey;
      return sameFeedScope && sameViewer ? keepPreviousData(previousData) : undefined;
    }
  });
}

function useActivityPostMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityPostKeys.feeds() })
  });
}

export function useCreateActivityPost() {
  return useActivityPostMutation(({ groupId, values }) => createActivityPost(groupId, values));
}

export function useModifyActivityPost() {
  return useActivityPostMutation(({ postId, values }) => modifyActivityPost(postId, values));
}

export function useDeleteActivityPost() {
  return useActivityPostMutation(({ postId }) => deleteActivityPost(postId));
}
