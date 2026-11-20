import { isNetworkError, isTimeoutError } from "ky";
import { z } from "zod";

import {
  announcementCreatedSchema,
  announcementDetailSchema,
  announcementListPageSchema
} from "../../entities/announcement/index.js";
import { apiRequest } from "../../shared/api/index.js";

const creationRetryDelays = [300, 600];

export class AnnouncementCreationUnconfirmedError extends Error {
  constructor(cause) {
    super("공지 등록 결과를 확인하지 못했어요. 공지 목록을 확인해 주세요.", { cause });
  }
}

export function fetchAnnouncements(groupId, cursor, signal) {
  return apiRequest(`groups/${groupId}/announcements`, {
    searchParams: { size: 20, ...(cursor ? { cursor } : {}) },
    schema: announcementListPageSchema,
    signal
  });
}

export function fetchAnnouncement(groupId, announcementId, signal) {
  return apiRequest(`groups/${groupId}/announcements/${announcementId}`, {
    searchParams: { includeManagement: true },
    schema: announcementDetailSchema,
    signal
  });
}

export async function createAnnouncement(groupId, values, signal) {
  let attempt = 0;
  while (true) {
    signal?.throwIfAborted();
    try {
      return await apiRequest(`groups/${groupId}/announcements`, {
        method: "post",
        json: values,
        schema: announcementCreatedSchema,
        signal
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (error.code === "ANNOUNCEMENT_REQUEST_CONFLICT") throw error;
      const retryable = isNetworkError(error) || isTimeoutError(error) ||
        [408, 502, 503, 504].includes(error.status) ||
        (error.code === "INVALID_RESPONSE" && error.status < 300);
      if (values.requestId && retryable && attempt < creationRetryDelays.length) {
        const delay = creationRetryDelays[attempt++];
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (attempt > 0 || retryable || error.status >= 500) {
        throw new AnnouncementCreationUnconfirmedError(error);
      }
      throw error;
    }
  }
}

export function modifyAnnouncement(groupId, announcementId, values) {
  return apiRequest(`groups/${groupId}/announcements/${announcementId}`, {
    method: "put",
    json: values,
    schema: z.null()
  });
}

export function deleteAnnouncement(groupId, announcementId) {
  return apiRequest(`groups/${groupId}/announcements/${announcementId}`, {
    method: "delete"
  });
}
