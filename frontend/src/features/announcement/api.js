import {
  announcementCreatedSchema,
  announcementDetailSchema,
  announcementListPageSchema
} from "../../entities/announcement/index.js";
import { apiRequest } from "../../shared/api/index.js";

export function fetchAnnouncements(groupId, cursor, signal) {
  return apiRequest(`groups/${groupId}/announcements`, {
    searchParams: { size: 20, ...(cursor ? { cursor } : {}) },
    schema: announcementListPageSchema,
    signal
  });
}

export function fetchAnnouncement(groupId, announcementId, signal) {
  return apiRequest(`groups/${groupId}/announcements/${announcementId}`, {
    schema: announcementDetailSchema,
    signal
  });
}

export function createAnnouncement(groupId, values) {
  return apiRequest(`groups/${groupId}/announcements`, {
    method: "post",
    json: values,
    schema: announcementCreatedSchema
  });
}
