import { z } from "zod";
import { apiClient } from "../../shared/api";

const id = z.number().int().positive().safe();
const notificationTargetSchema = z.union([
  z.object({ kind: z.literal("INVITATION"), groupId: id, invitationId: id }),
  z.object({ kind: z.literal("ACTIVITY_POST"), groupId: id, activityPostId: id }),
  z.object({ kind: z.literal("GROUP_ANNOUNCEMENT"), groupId: id, announcementId: id }),
  z.object({ kind: z.literal("GROUP_DETAIL"), groupId: id, recruitmentId: id.optional(), registrationId: id.optional() }),
  z.object({ kind: z.enum(["LEADER_REGISTRATIONS", "MY_REGISTRATIONS", "LEADER_MEMBERS", "MY_PAGE", "MY_GROUPS"]), groupId: id, recruitmentId: id, registrationId: id.optional() })
]);
export const notificationSchema = z.object({
  id, eventType: z.string(), payloadVersion: z.literal(1), title: z.string(), body: z.string(),
  createdAt: z.string(), readAt: z.string().nullable(),
  target: notificationTargetSchema
}).refine((notification) => notification.eventType === "INVITATION_RECEIVED"
  ? notification.target.kind === "INVITATION"
  : notification.eventType === "ACTIVITY_POST_COMMENTED" || notification.eventType === "ACTIVITY_POST_REACTED"
    ? notification.target.kind === "ACTIVITY_POST"
    : notification.eventType === "GROUP_ANNOUNCEMENT_CREATED"
      ? notification.target.kind === "GROUP_ANNOUNCEMENT"
    : notification.eventType === "GROUP_CREATED"
      ? notification.target.kind === "GROUP_DETAIL" && notification.target.recruitmentId === undefined && notification.target.registrationId === undefined
      : notification.target.kind !== "INVITATION" && notification.target.kind !== "GROUP_ANNOUNCEMENT" && notification.target.recruitmentId !== undefined,
  { message: "알림 종류에 맞는 이동 대상이 필요합니다." }
).transform((notification) => notification.eventType === "REGISTRATION_APPROVED" && notification.target.kind === "GROUP_DETAIL"
  ? { ...notification, target: { ...notification.target, kind: "MY_GROUPS" } } : notification);
export const notificationPageSchema = z.object({
  items: z.array(notificationSchema), nextCursor: z.string().nullable(), hasNext: z.boolean()
}).refine((page) => !page.hasNext || Boolean(page.nextCursor));
const pageParams = (cursor) => ({ clientVersion: 2, size: 20, ...(cursor ? { cursor } : {}) });
export const fetchNotifications = (cursor, client = apiClient, signal) => client.request("notifications", {
  schema: notificationPageSchema, searchParams: pageParams(cursor), signal
});
export const fetchUnreadCount = (client = apiClient, signal) => client.request("notifications/unread-count", {
  schema: z.object({ unreadCount: z.number().int().nonnegative().safe() }), searchParams: { clientVersion: 2 }, signal
});
export const fetchNotification = (notificationId, client = apiClient, signal) => client.request(`notifications/${notificationId}`, { schema: notificationSchema, searchParams: { clientVersion: 2 }, signal });
export const readNotification = (notificationId, client = apiClient) => client.request(`notifications/${notificationId}/read`, {
  method: "PATCH", schema: z.object({ id, readAt: z.string() })
});
export const readAllNotifications = (client = apiClient) => client.request("notifications/read-all", {
  method: "PATCH", schema: z.object({ updatedCount: z.number().int().nonnegative(), readAt: z.string() }), searchParams: { clientVersion: 2 }
});
export const deleteNotification = (notificationId, client = apiClient) => client.request(`notifications/${notificationId}`, { method: "DELETE" });
export const notificationTargetPath = ({ kind, groupId, recruitmentId, registrationId, invitationId, activityPostId }, notificationId) => {
  if (kind === "INVITATION") return `/invitations/${invitationId}`;
  if (kind === "ACTIVITY_POST") return `/activities?mine=true&post=${activityPostId}`;
  if (kind === "GROUP_ANNOUNCEMENT") return `/groups/${groupId}`;
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
