import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useAuth } from "../../src/features/auth";
import { NotificationSessionBoundary } from "../../src/features/notifications/NotificationSessionBoundary";
import { useNotificationList } from "../../src/features/notifications/hooks";
import { fetchNotifications } from "../../src/features/notifications/api";

jest.mock("../../src/features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/features/push/browser", () => ({
  pushEnvironment: () => ({ supported: false }), disarmPush: jest.fn(async () => null)
}));
jest.mock("../../src/features/notifications/api", () => ({ fetchNotifications: jest.fn() }));
function Probe() {
  const query = useNotificationList();
  return <output>{query.data?.pages.flatMap((page) => page.items).map((item) => item.title).join(",") ?? "loading"}</output>;
}
test("late A response does not appear in B's inbox or remain under A's cached key", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveA;
  fetchNotifications.mockImplementationOnce(() => new Promise((done) => { resolveA = done; }))
    .mockResolvedValue({ items: [{ id: 2, title: "B의 알림" }], hasNext: false, nextCursor: null });
  useAuth.mockReturnValue({ member: { id: 1 }, sessionVersion: 1, status: "authenticated" });
  const tree = () => <QueryClientProvider client={client}><NotificationSessionBoundary /><Probe /></QueryClientProvider>;
  const view = render(tree());
  useAuth.mockReturnValue({ member: { id: 2 }, sessionVersion: 2, status: "authenticated" });
  view.rerender(tree());
  await screen.findByText("B의 알림");
  await act(async () => resolveA({ items: [{ id: 1, title: "A의 알림" }], hasNext: false, nextCursor: null }));
  expect(screen.queryByText("A의 알림")).not.toBeInTheDocument();
  expect(client.getQueryData(["notifications", 1, 1, "list"])).toBeUndefined();
  client.clear();
});
