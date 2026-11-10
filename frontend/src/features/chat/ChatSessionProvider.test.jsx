import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Client } from "@stomp/stompjs";
import { useAuth } from "../auth";
import { fetchAllRooms } from "./api";
import { ChatSessionProvider } from "./ChatSessionProvider";

jest.mock("@stomp/stompjs", () => ({ Client: jest.fn() }));
jest.mock("../auth", () => ({ useAuth: jest.fn(), getMe: jest.fn() }));
jest.mock("./api", () => ({ fetchAllRooms: jest.fn(), fetchMessages: jest.fn(), catchUp: jest.fn() }));

let sockets;
let auth;
let focused;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  focused = true;
  jest.spyOn(document, "hasFocus").mockImplementation(() => focused);
  sockets = [];
  auth = { status: "authenticated", member: { id: 2 }, sessionVersion: 1, reload: jest.fn() };
  useAuth.mockImplementation(() => auth);
  fetchAllRooms.mockResolvedValue([]);
  Client.mockImplementation((options) => {
    const socket = { options, connected: false, activate: jest.fn(), deactivate: jest.fn().mockResolvedValue(), subscribe: jest.fn(), publish: jest.fn() };
    sockets.push(socket);
    return socket;
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => <QueryClientProvider client={client}><ChatSessionProvider><div>Home</div></ChatSessionProvider></QueryClientProvider>;
  const result = render(ui());
  return { ...result, refresh: () => result.rerender(ui()) };
}
async function connect(socket) {
  await act(async () => { socket.connected = true; socket.options.onConnect(); });
}

test("home activity uses the shared authenticated socket without marking chat read or disconnecting on blur", async () => {
  const view = setup();
  const socket = sockets[0];
  await connect(socket);
  expect(socket.publish).toHaveBeenCalledWith({ destination: "/app/presence/active", body: "" });
  expect(socket.subscribe).toHaveBeenCalledWith("/user/queue/chat-events", expect.any(Function));
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(socket.publish).toHaveBeenCalledTimes(2);
  focused = false;
  act(() => window.dispatchEvent(new Event("blur")));
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(socket.publish).toHaveBeenCalledTimes(2);
  expect(socket.deactivate).not.toHaveBeenCalled();
  expect(sockets).toHaveLength(1);
  view.unmount();
  expect(socket.deactivate).toHaveBeenCalledWith({ force: true });
});

test("logout and account changes dispose the old activity timer and reject stale reconnect callbacks", async () => {
  const view = setup();
  const first = sockets[0];
  await connect(first);
  auth = { ...auth, member: { id: 3 }, sessionVersion: 2 };
  view.refresh();
  const second = sockets[1];
  await connect(second);
  expect(first.deactivate).toHaveBeenCalledWith({ force: true });
  await act(async () => { first.options.onConnect(); jest.advanceTimersByTime(10000); });
  expect(first.publish).toHaveBeenCalledTimes(1);
  expect(second.publish).toHaveBeenCalledTimes(2);
  auth = { ...auth, logoutPending: true };
  view.refresh();
  await act(async () => { second.options.onConnect(); jest.advanceTimersByTime(10000); });
  expect(second.deactivate).toHaveBeenCalledWith({ force: true });
  expect(second.publish).toHaveBeenCalledTimes(2);
  auth = { ...auth, status: "anonymous", member: null, logoutPending: false };
  view.refresh();
  act(() => window.dispatchEvent(new Event("click")));
  expect(sockets).toHaveLength(2);
  view.unmount();
});

test("anonymous home creates no activity connection", () => {
  auth = { ...auth, status: "anonymous", member: null };
  const view = setup();
  expect(Client).not.toHaveBeenCalled();
  view.unmount();
});
