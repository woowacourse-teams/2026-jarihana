import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationInbox } from "../../src/features/notifications/NotificationInbox";
import * as api from "../../src/features/notifications/api";

jest.mock("../../src/features/auth", () => ({ useAuth: () => ({ member: { id: 1 }, status: "authenticated", sessionVersion: 1 }) }));
jest.mock("../../src/features/push/PushSettings", () => ({ PushSettings: () => <p>이 브라우저의 푸시 알림</p> }));
jest.mock("react-router", () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }));
jest.mock("../../src/features/notifications/api");
const original = jest.requireActual("../../src/features/notifications/api");
let rows;
let client;
const row = (id, readAt = null) => ({ id, title: `알림 ${id}`, body: "신청이 승인되었습니다.", createdAt: "2026-10-05T12:00:00", readAt });
beforeEach(() => {
  rows = [row(1), row(2, "2026-10-05T12:00:00")];
  jest.clearAllMocks();
  api.fetchNotifications.mockImplementation(async () => ({ items: rows.map((item) => ({ ...item })), hasNext: false, nextCursor: null }));
  api.fetchUnreadCount.mockImplementation(async () => ({ unreadCount: rows.filter((item) => !item.readAt).length }));
  api.readAllNotifications.mockImplementation(async () => {
    rows = rows.map((item) => ({ ...item, readAt: item.readAt ?? "2026-10-05T12:30:00" }));
    return { updatedCount: 1, readAt: "2026-10-05T12:30:00" };
  });
  api.deleteNotification.mockImplementation(async (id) => { rows = rows.filter((item) => item.id !== id); });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => client.clear());
function mount() { return render(<QueryClientProvider client={client}><NotificationInbox /></QueryClientProvider>); }
test("opening leaves unread rows intact; read-all retains rows and rechecks new arrivals", async () => {
  mount();
  await screen.findByText("알림 1");
  expect(api.readAllNotifications).not.toHaveBeenCalled();
  api.readAllNotifications.mockImplementationOnce(async () => {
    rows[0].readAt = "2026-10-05T12:30:00";
    rows.push(row(3));
    return { updatedCount: 1, readAt: "2026-10-05T12:30:00" };
  });
  fireEvent.click(screen.getByRole("button", { name: "전체 읽음" }));
  await screen.findByText("알림 3");
  expect(screen.getByText("알림 1")).toBeInTheDocument();
  expect(screen.getAllByText("안 읽음")).toHaveLength(1);
  expect(screen.getAllByRole("link")).toHaveLength(3);
});
test("delete failure retains row, success slides only that row and preserves keyboard focus", async () => {
  mount();
  await screen.findByText("알림 1");
  api.deleteNotification.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "알림 1 알림 삭제" }));
  await screen.findByRole("alert");
  expect(screen.getByText("알림 1")).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "알림 1 알림 삭제" });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByText("알림 1").closest("li")).toHaveClass("notification-row--exiting"));
  expect(screen.getByText("알림 2").closest("a")).toHaveFocus();
  await waitFor(() => expect(screen.queryByText("알림 1")).not.toBeInTheDocument());
  expect(screen.getByText("알림 2")).toBeInTheDocument();
});
test("empty state appears after deleting the last row", async () => {
  rows = [row(1)];
  mount();
  await screen.findByText("알림 1");
  fireEvent.click(screen.getByRole("button", { name: "알림 1 알림 삭제" }));
  await screen.findByText("아직 받은 알림이 없어요.");
});
test("server targets map to internal destinations and unsupported targets are rejected", () => {
  for (const [kind, path] of Object.entries({ GROUP_DETAIL: "/groups/10", MY_REGISTRATIONS: "/my?registrationStatus=REJECTED&focusRecruitment=20", MY_PAGE: "/my?registrationStatus=REJECTED&focusRecruitment=20", MY_GROUPS: "/my?focusGroup=10",
    LEADER_REGISTRATIONS: "/groups/10/manage/registrations", LEADER_MEMBERS: "/groups/10/manage/members" })) {
    expect(original.notificationTargetPath({ kind, groupId: 10, recruitmentId: 20 })).toBe(path);
  }
  expect(original.notificationTargetPath({ kind: "MY_PAGE", groupId: 10, recruitmentId: 20, registrationId: 44 }, 5))
    .toBe("/my?registrationStatus=REJECTED&focusRegistration=44&notification=5");
  expect(original.notificationSchema.safeParse({ ...row(1), payloadVersion: 1, eventType: "REGISTRATION_APPROVED",
    target: { kind: "EXTERNAL", groupId: 1, recruitmentId: 2 } }).success).toBe(false);
});

test("previous backend approval destination also focuses the joined group on my page", () => {
  const notification = original.notificationSchema.parse({ ...row(1), payloadVersion: 1,
    eventType: "REGISTRATION_APPROVED", target: { kind: "GROUP_DETAIL", groupId: 10, recruitmentId: 20 } });
  expect(original.notificationTargetPath(notification.target, notification.id)).toBe("/my?focusGroup=10&notification=1");
});

test("new group notifications need only a group id and open the group detail", () => {
  const notification = original.notificationSchema.parse({ ...row(1), payloadVersion: 1,
    eventType: "GROUP_CREATED", target: { kind: "GROUP_DETAIL", groupId: 10 } });
  expect(original.notificationTargetPath(notification.target, notification.id)).toBe("/groups/10");
  expect(original.notificationSchema.safeParse({ ...notification,
    eventType: "REGISTRATION_SUBMITTED" }).success).toBe(false);
});
