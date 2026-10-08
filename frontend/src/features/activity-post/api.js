import { z } from "zod";

import {
  activityCommentCreateResponseSchema,
  activityCommentPageSchema,
  activityPostCreateResponseSchema,
  activityPostPageSchema
} from "../../entities/activity-post/index.js";
import { apiRequest } from "../../shared/api/index.js";

const activityPostMutationResponseSchema = z.null();

function buildActivityPostParams({ cursor, mine, size = 20 } = {}) {
  return {
    ...(cursor ? { cursor } : {}),
    ...(mine ? { mine: true } : {}),
    size
  };
}

export function fetchActivityPosts({ cursor, groupId, mine, size } = {}) {
  const path = groupId ? `groups/${groupId}/activity-posts` : "activity-posts";
  return apiRequest(path, {
    searchParams: buildActivityPostParams({ cursor, mine, size }),
    schema: activityPostPageSchema
  });
}

export function createActivityPost(groupId, values) {
  return apiRequest(`groups/${groupId}/activity-posts`, {
    method: "post",
    json: values,
    schema: activityPostCreateResponseSchema
  });
}

export function modifyActivityPost(postId, values) {
  return apiRequest(`activity-posts/${postId}`, {
    method: "put",
    json: values,
    schema: activityPostMutationResponseSchema
  });
}

export function deleteActivityPost(postId) {
  return apiRequest(`activity-posts/${postId}`, {
    method: "delete",
    schema: activityPostMutationResponseSchema
  });
}

export function fetchActivityComments({ postId, cursor, size = 20 }) {
  return apiRequest(`activity-posts/${postId}/comments`, {
    searchParams: { ...(cursor ? { cursor } : {}), size },
    schema: activityCommentPageSchema
  });
}

export function createActivityComment(postId, content) {
  return apiRequest(`activity-posts/${postId}/comments`, {
    method: "post",
    json: { content },
    schema: activityCommentCreateResponseSchema
  });
}

// 본문 없는 204 응답이라 응답 스키마를 검사하지 않는다.
export function deleteActivityComment(commentId) {
  return apiRequest(`activity-post-comments/${commentId}`, { method: "delete" });
}

function reactionPath(target, emoji) {
  return target.type === "comment"
    ? `activity-post-comments/${target.id}/reactions/${emoji}`
    : `activity-posts/${target.id}/reactions/${emoji}`;
}

export function addActivityReaction(target, emoji) {
  return apiRequest(reactionPath(target, emoji), { method: "put" });
}

export function removeActivityReaction(target, emoji) {
  return apiRequest(reactionPath(target, emoji), { method: "delete" });
}
