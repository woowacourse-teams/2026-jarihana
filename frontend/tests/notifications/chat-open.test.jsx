import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { useNavigate } from "react-router";
import { NotificationOpenPage } from "../../src/pages/notifications";
import { fetchMessages } from "../../src/features/chat/api";
import { fetchNotification, readNotification } from "../../src/features/notifications/api";

jest.mock("../../src/features/auth", () => ({ useAuth: () => ({ member: { id: 1 }, status: "authenticated", sessionVersion: 1 }) }));
jest.mock("react-router", () => ({ useNavigate: jest.fn(), useParams: () => ({ id: "5" }) }));
jest.mock("../../src/features/chat/api", () => ({ fetchMessages: jest.fn() }));
jest.mock("../../src/features/notifications/NotificationInbox", () => ({ NotificationDrawer: () => null }));
jest.mock("../../src/features/notifications/api", () => ({
  ...jest.requireActual("../../src/features/notifications/api"),
  fetchNotification: jest.fn(), readNotification: jest.fn()
}));

let client;
let navigate;
function mount() {
  return render(<QueryClientProvider client={client}>
    <NotificationOpenPage />
  </QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  navigate = jest.fn();
  useNavigate.mockReturnValue(navigate);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  fetchNotification.mockResolvedValue({ id: 5, eventType: "CHAT_MESSAGE_RECEIVED", target: { kind: "GROUP_CHAT", groupId: 10 } });
  fetchMessages.mockResolvedValue({ items: [] });
  readNotification.mockResolvedValue({ id: 5, readAt: "2026-11-05T12:00:00" });
});
afterEach(() => client.clear());

test("chat notification verifies room access before reading and opening the room", async () => {
  let allowAccess;
  fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { allowAccess = resolve; }));
  mount();
  await waitFor(() => expect(fetchMessages).toHaveBeenCalledWith(10, { size: 1 }, expect.any(AbortSignal)));
  expect(readNotification).not.toHaveBeenCalled();
  allowAccess({ items: [] });
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/chat/10", { replace: true }));
  expect(readNotification).toHaveBeenCalledWith("5");
});

test.each([403, 404])("inaccessible chat (%s) leaves the notification unread", async (status) => {
  fetchMessages.mockRejectedValueOnce(Object.assign(new Error("Unavailable"), { status }));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("이 알림을 확인할 수 없어요.");
  expect(readNotification).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
