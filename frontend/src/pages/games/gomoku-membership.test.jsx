import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { GomokuLobbyPage, GomokuRoomPage } from "./index";
import { gomokuApi } from "../../features/gomoku/api";
import { useGomokuRoom } from "../../features/gomoku/useGomokuRoom";
import { syncGomokuMembership } from "../../features/gomoku/membership";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const packageRoot = dirname(require.resolve("react-router/package.json"));
  const hooks = jest.requireActual(join(packageRoot, "dist/production/lib/hooks.js"));
  return {
    ...jest.requireActual(join(packageRoot, "dist/production/lib/components.js")),
    ...hooks,
    useSearchParams: () => {
      const location = hooks.useLocation();
      const navigate = hooks.useNavigate();
      const params = new URLSearchParams(location.search);
      return [params, (next) => navigate({ search: `?${typeof next === "function" ? next(params) : new URLSearchParams(next)}` })];
    },
    Link: function TestLink({ children, to, ...properties }) {
      const navigate = hooks.useNavigate();
      return (
        <a href={to} {...properties} onClick={(event) => { event.preventDefault(); navigate(to); }}>
          {children}
        </a>
      );
    }
  };
});

jest.mock("../../features/auth", () => ({
  useAuth: () => ({ member: { id: 1 }, status: "authenticated" })
}));
jest.mock("../../features/gomoku/useGomokuRoom", () => ({
  useGomokuRoom: jest.fn(() => ({
    room: {
      id: 1,
      hostMemberId: 1,
      hostName: "크루",
      guestMemberId: null,
      guestName: null,
      status: "WAITING",
      visibility: "PUBLIC",
      rule: "RENJU",
      gameNumber: 0,
      blackMemberId: 0,
      hostReady: false,
      guestReady: false,
      board: "0".repeat(225),
      ply: 0,
      turnDeadline: null
    },
    connected: true,
    pending: false,
    offset: { current: 0 }
  }))
}));

function mount(openLeave = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60000 } }
  });
  client.setQueryData(["gomoku", "mine"], { roomId: 1 });
  jest.spyOn(gomokuApi, "mine").mockResolvedValue({ roomId: null });
  jest.spyOn(gomokuApi, "list").mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/games/gomoku/rooms/1"]}>
        <Routes>
          <Route path="/games/gomoku/rooms/:roomId" element={<GomokuRoomPage />} />
          <Route path="/games/gomoku" element={<GomokuLobbyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  if (openLeave) {
    const leave = screen.getByRole("button", { name: "나가기", exact: true });
    leave.focus();
    fireEvent.click(leave);
  }
  return client;
}

afterEach(() => jest.restoreAllMocks());

test("successful leave clears a fresh cached membership before returning to the lobby", async () => {
  jest.spyOn(gomokuApi, "leave").mockResolvedValue({ roomId: 1 });
  const client = mount();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "확인", exact: true })
  );
  await screen.findByRole("heading", { name: "대기실", exact: true });
  expect(client.getQueryData(["gomoku", "mine"])).toEqual({ roomId: null });
  expect(screen.queryByRole("complementary", { name: "참여 중인 자리" })).not.toBeInTheDocument();
  expect(gomokuApi.mine).not.toHaveBeenCalled();
  client.clear();
});

test("failed leave preserves the membership and keeps the confirmation open", async () => {
  jest.spyOn(gomokuApi, "leave").mockRejectedValue(new Error("offline"));
  const client = mount();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "확인", exact: true })
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("요청을 완료하지 못했어요.")
  );
  expect(client.getQueryData(["gomoku", "mine"])).toEqual({ roomId: 1 });
  expect(screen.getByRole("dialog", { name: "방에서 나갈까요?" })).toBeVisible();
  client.clear();
});

test("an older in-flight membership response cannot restore the room after leaving", async () => {
  const client = new QueryClient();
  let complete;
  const request = client
    .fetchQuery({
      queryKey: ["gomoku", "mine"],
      queryFn: () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    })
    .catch(() => undefined);
  await syncGomokuMembership(client, null);
  complete({ roomId: 1 });
  await request;
  expect(client.getQueryData(["gomoku", "mine"])).toEqual({ roomId: null });
  client.clear();
});

test("canceling leave keeps the room and never sends a leave request", async () => {
  const leave = jest.spyOn(gomokuApi, "leave").mockResolvedValue({ roomId: 1 });
  const client = mount();
  expect(screen.getByRole("dialog", { name: "방에서 나갈까요?" })).toBeVisible();
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "취소", exact: true })
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(client.getQueryData(["gomoku", "mine"])).toEqual({ roomId: 1 });
  expect(screen.getByRole("button", { name: "나가기", exact: true })).toHaveFocus();
  expect(leave).not.toHaveBeenCalled();
  client.clear();
});

test("separate leave button can leave over HTTP while the realtime connection is unavailable", async () => {
  const original = useGomokuRoom.getMockImplementation();
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValue({ ...state, connected: false });
  jest.spyOn(gomokuApi, "leave").mockResolvedValue({ roomId: 1 });
  try {
    const client = mount();
    expect(screen.getByRole("dialog", { name: "방에서 나갈까요?" })).toBeVisible();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "확인", exact: true })
    );
    await screen.findByRole("heading", { name: "대기실", exact: true });
    expect(gomokuApi.leave).toHaveBeenCalledWith(1);
    expect(client.getQueryData(["gomoku", "mine"])).toEqual({ roomId: null });
    client.clear();
  } finally {
    useGomokuRoom.mockImplementation(original);
  }
});


test("lobby navigation preserves membership without opening a leave dialog or sending a leave request", async () => {
  const leave = jest.spyOn(gomokuApi, "leave").mockResolvedValue({ roomId: 1 });
  const client = mount(false);
  fireEvent.click(screen.getByRole("link", { name: "대기실", exact: true }));
  await screen.findByRole("heading", { name: "대기실", exact: true });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(leave).not.toHaveBeenCalled();
  expect(client.getQueryData(["gomoku", "mine"])).toEqual({ roomId: 1 });
  expect(screen.getByRole("link", { name: /돌아가기/ })).toHaveAttribute("href", "/games/gomoku/rooms/1");
  fireEvent.click(screen.getByRole("link", { name: /돌아가기/ }));
  expect(screen.getByRole("button", { name: "나가기", exact: true })).toBeVisible();
  expect(leave).not.toHaveBeenCalled();
  client.clear();
});
