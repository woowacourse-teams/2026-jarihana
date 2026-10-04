import { z } from "zod";

import { activityPostCreateResponseSchema, activityPostPageSchema } from "../../entities/activity-post/index.js";
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
