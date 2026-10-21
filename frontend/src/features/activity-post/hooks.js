import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { toggleActivityReaction } from "../../entities/activity-post/index.js";
import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { captureEvent } from "../../shared/analytics/index.js";
import {
  addActivityReaction,
  createActivityComment,
  createActivityPost,
  deleteActivityComment,
  deleteActivityPost,
  fetchActivityComments,
  fetchActivityPosts,
  modifyActivityPost,
  removeActivityReaction
} from "./api.js";

export const activityPostKeys = {
  all: ["activityPosts"],
  feeds: () => ["activityPosts", "feed"],
  feed: ({ groupId = null, mine = false, viewerKey = "anonymous" } = {}) => [
    "activityPosts",
    "feed",
    groupId,
    mine,
    viewerKey
  ],
  comments: (postId) => ["activityPosts", "comments", String(postId)],
  commentList: (postId, viewerKey = "anonymous") => ["activityPosts", "comments", String(postId), viewerKey]
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

export function useInfiniteActivityComments({ postId, viewerKey = "anonymous", enabled = true }) {
  return useInfiniteQuery({
    queryKey: activityPostKeys.commentList(postId, viewerKey),
    enabled: enabled && Boolean(postId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchActivityComments({ postId, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor
  });
}

function mapInfiniteItems(data, mapItem) {
  if (!data?.pages) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(mapItem) })) };
}

// 피드 전체를 다시 불러오면 사진 벽이 재배치되므로, 해당 기록의 값만 고친다.
function updateFeedPost(queryClient, postId, update) {
  queryClient.setQueriesData({ queryKey: activityPostKeys.feeds() }, (data) =>
    mapInfiniteItems(data, (post) => (post.id === postId ? update(post) : post))
  );
}

function eventProperties(post, viewerRelation) {
  return { group_id: post.group.id, activity_post_id: post.id, viewer_relation: viewerRelation };
}

export function useCreateActivityComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ post, content }) => createActivityComment(post.id, content),
    onSuccess: (_comment, { post, viewerRelation }) => {
      captureEvent("activity_comment_created", eventProperties(post, viewerRelation));
      updateFeedPost(queryClient, post.id, (item) => ({ ...item, commentCount: item.commentCount + 1 }));
      return queryClient.invalidateQueries({ queryKey: activityPostKeys.comments(post.id) });
    }
  });
}

export function useDeleteActivityComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }) => deleteActivityComment(commentId),
    onSuccess: (_data, { post, viewerRelation }) => {
      captureEvent("activity_comment_deleted", eventProperties(post, viewerRelation));
      updateFeedPost(queryClient, post.id, (item) => ({
        ...item,
        commentCount: Math.max(0, item.commentCount - 1)
      }));
      return queryClient.invalidateQueries({ queryKey: activityPostKeys.comments(post.id) });
    }
  });
}

function applyReaction(queryClient, { post, target, emoji, reacted }) {
  const nextReacted = !reacted;
  if (target.type === "post") {
    updateFeedPost(queryClient, post.id, (item) => ({
      ...item,
      reactions: toggleActivityReaction(item.reactions, emoji, nextReacted)
    }));
    return;
  }
  queryClient.setQueriesData({ queryKey: activityPostKeys.comments(post.id) }, (data) =>
    mapInfiniteItems(data, (comment) =>
      comment.id === target.id
        ? { ...comment, reactions: toggleActivityReaction(comment.reactions, emoji, nextReacted) }
        : comment
    )
  );
}

/**
 * `reacted`는 누르기 전 상태다. 화면을 먼저 바꾸고 실패하면 서버 값으로 다시 맞춘다.
 */
export function useToggleActivityReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ target, emoji, reacted }) =>
      reacted ? removeActivityReaction(target, emoji) : addActivityReaction(target, emoji),
    onMutate: (variables) => applyReaction(queryClient, variables),
    onSuccess: (_data, { post, target, emoji, reacted, viewerRelation }) => {
      captureEvent(reacted ? "activity_reaction_removed" : "activity_reaction_added", {
        ...eventProperties(post, viewerRelation),
        target_type: target.type,
        emoji: emoji.toLowerCase()
      });
    },
    onError: (_error, { post, target }) =>
      queryClient.invalidateQueries({
        queryKey: target.type === "post" ? activityPostKeys.feeds() : activityPostKeys.comments(post.id)
      })
  });
}
