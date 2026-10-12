import { z } from "zod";
import { apiClient } from "../../shared/api";

const id = z.number().int().positive().safe();
export const notificationSchema = z.object({
  id, eventType: z.string(), payloadVersion: z.literal(1), title: z.string(), body: z.string(),
  createdAt: z.string(), readAt: z.string().nullable(),
  target: z.object({ kind: z.enum(["GROUP_DETAIL", "LEADER_REGISTRATIONS", "MY_REGISTRATIONS", "LEADER_MEMBERS", "MY_PAGE", "MY_GROUPS"]), groupId: id, recruitmentId: id.optional(), registrationId: id.optional() })
}).refine((notification) => notification.eventType === "GROUP_CREATED"
  ? notification.target.kind === "GROUP_DETAIL" && notification.target.recruitmentId === undefined && notification.target.registrationId === undefined
  : notification.target.recruitmentId !== undefined, { message: "알림 종류에 맞는 이동 대상이 필요합니다." }
).transform((notification) => notification.eventType === "REGISTRATION_APPROVED" && notification.target.kind === "GROUP_DETAIL"
  ? { ...notification, target: { ...notification.target, kind: "MY_GROUPS" } } : notification);
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
export const notificationTargetPath = ({ kind, groupId, recruitmentId, registrationId }, notificationId) => {
  const context = notificationId ? `&notification=${notificationId}` : "";
  if (kind === "MY_GROUPS") return `/my?focusGroup=${groupId}${context}`;
  if (kind === "MY_PAGE" || kind === "MY_REGISTRATIONS") {
    const focus = registrationId ? `focusRegistration=${registrationId}` : `focusRecruitment=${recruitmentId}`;
    return `/my?registrationStatus=REJECTED&${focus}${context}`;
  }
  if (kind === "LEADER_REGISTRATIONS") return `/groups/${groupId}/manage/registrations`;
  if (kind === "LEADER_MEMBERS") return `/groups/${groupId}/manage/members`;
  return `/groups/${groupId}`;
};
