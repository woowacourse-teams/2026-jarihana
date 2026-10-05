import { z } from "zod";
import { apiClient } from "../../shared/api";

const id = z.number().int().positive().safe();
export const notificationSchema = z.object({
  id, eventType: z.string(), payloadVersion: z.literal(1), title: z.string(), body: z.string(),
  createdAt: z.string(), readAt: z.string().nullable(),
  target: z.object({ kind: z.enum(["GROUP_DETAIL", "LEADER_REGISTRATIONS", "MY_REGISTRATIONS"]), groupId: id, recruitmentId: id })
});
export const notificationPageSchema = z.object({
  items: z.array(notificationSchema), nextCursor: z.string().nullable(), hasNext: z.boolean()
}).refine((page) => !page.hasNext || Boolean(page.nextCursor));
const pageParams = (cursor) => ({ size: 20, ...(cursor ? { cursor } : {}) });
export const fetchNotifications = (cursor, client = apiClient, signal) => client.request("notifications", {
  schema: notificationPageSchema, searchParams: pageParams(cursor), signal
});
export const fetchUnreadCount = (client = apiClient, signal) => client.request("notifications/unread-count", {
  schema: z.object({ unreadCount: z.number().int().nonnegative().safe() }), signal
});
export const fetchNotification = (notificationId, client = apiClient, signal) => client.request(`notifications/${notificationId}`, { schema: notificationSchema, signal });
export const readNotification = (notificationId, client = apiClient) => client.request(`notifications/${notificationId}/read`, {
  method: "PATCH", schema: z.object({ id, readAt: z.string() })
});
export const readAllNotifications = (client = apiClient) => client.request("notifications/read-all", {
  method: "PATCH", schema: z.object({ updatedCount: z.number().int().nonnegative(), readAt: z.string() })
});
export const deleteNotification = (notificationId, client = apiClient) => client.request(`notifications/${notificationId}`, { method: "DELETE" });
export const notificationTargetPath = ({ groupId }) => `/groups/${groupId}`;
