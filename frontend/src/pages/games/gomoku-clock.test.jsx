import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GomokuRoomPage } from "./index";
import { useGomokuRoom } from "../../features/gomoku/useGomokuRoom";
import { gomokuApi } from "../../features/gomoku/api";
import { useNavigate } from "react-router";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  useNavigate: jest.fn(() => jest.fn()),
  useParams: () => ({ roomId: "1" })
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(),
  useQueryClient: () => ({
    cancelQueries: jest.fn().mockResolvedValue(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn().mockResolvedValue()
  })
}));

jest.mock("../../features/auth", () => ({
  useAuth: () => ({ member: { id: 1 }, status: "authenticated" })
}));
jest.mock("../../features/gomoku/useGomokuRoom", () => ({
  useGomokuRoom: jest.fn(() => ({
    room: {
      id: 1,
      hostMemberId: 1,
      hostName: "흑",
      guestMemberId: 2,
      guestName: "백",
      visibility: "PUBLIC",
      rule: "RENJU",
      status: "PLAYING",
      gameNumber: 1,
      blackMemberId: 1,
      board: "0".repeat(225),
      ply: 0,
      lastX: null,
      lastY: null,
      turnDeadline: 61000
    },
    connected: true,
    pending: false,
    error: null,
    offset: { current: -1000 }
  }))
}));

test("a newly received server clock offset cannot display more than sixty seconds", () => {
  jest.useFakeTimers({ now: 1000 });
  try {
    render(<GomokuRoomPage />);
    expect(screen.getByLabelText("남은 시간 60초")).toBeInTheDocument();
    expect(screen.queryByLabelText("남은 시간 61초")).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test("room keeps the selected rule badge without a separate rules button or dialog", () => {
  render(<GomokuRoomPage />);
  expect(screen.queryByRole("dialog", { name: "오목 규칙" })).not.toBeInTheDocument();
  const settings = screen.getByRole("list", { name: "방 설정" });
  expect(within(settings).getByText("기본 규칙", { exact: true })).toBeVisible();
  expect(within(settings).getByText("공개방", { exact: true })).toBeVisible();
  expect(screen.getByRole("link", { name: "대기실", exact: true })).toHaveAttribute("href", "/games/gomoku");
  expect(screen.getByRole("button", { name: "나가기", exact: true })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "gomoku_leave_open"
  );
  expect(screen.queryByRole("heading", { name: "오목", exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/한 줄로 6개 이상/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "규칙", exact: true })).not.toBeInTheDocument();
});

test("compact move control enables confirmation only after selecting an empty cell", () => {
  jest.useFakeTimers({ now: 1000 });
  try {
    render(<GomokuRoomPage />);
    expect(screen.getByRole("button", { name: "자리하기", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "H8, 빈 자리" }));
    const confirm = screen.getByRole("button", { name: "자리하기", exact: true });
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_move_confirm");
    expect(screen.getByRole("button", { name: "H8, 빈 자리" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  } finally {
    jest.useRealTimers();
  }
});

test("rematch shows each player's readiness without an inactive move button", () => {
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    room: {
      ...state.room,
      status: "FINISHED",
      hostReady: true,
      guestReady: false,
      winnerMemberId: 1,
      endReason: "FIVE"
    }
  });
  render(<GomokuRoomPage />);
  expect(screen.getByText("준비 완료")).toBeVisible();
  expect(screen.getByText("준비 전")).toBeVisible();
  expect(screen.getByRole("button", { name: "준비 취소" })).toBeEnabled();
  expect(
    document.querySelector('[data-ph-capture-attribute-action="gomoku_move_confirm"]')
  ).not.toBeInTheDocument();
});

test.each([
  [1, "WIN"],
  [2, "LOSE"],
  [null, "DRAW"]
])(
  "finished room shows the correct result for winner %s with one rematch action",
  (winnerMemberId, label) => {
    const state = useGomokuRoom();
    useGomokuRoom.mockReturnValueOnce({
      ...state,
      room: {
        ...state.room,
        status: "FINISHED",
        winnerMemberId,
        endReason: winnerMemberId == null ? "DRAW" : "FIVE"
      }
    });
    const { container } = render(<GomokuRoomPage />);
    expect(screen.getByRole("heading", { name: label, exact: true })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "다시 대결", exact: true })).toHaveLength(1);
    expect(container.querySelector(".gomoku-board-surface")).toHaveAttribute("inert");
    expect(container.querySelector(".gomoku-table")).toHaveClass("gomoku-table--covered");
    expect(container.querySelector(".gomoku-controls")).not.toBeInTheDocument();
    expect(screen.queryByText("대국 종료")).not.toBeInTheDocument();
    expect(screen.queryByText("다섯 돌을 이었어요")).not.toBeInTheDocument();
    expect(screen.queryByText("무승부예요")).not.toBeInTheDocument();
  }
);

test("rematch action sends next-game readiness and new game removes the result overlay", () => {
  const state = useGomokuRoom();
  const originalHook = useGomokuRoom.getMockImplementation();
  const ready = jest.spyOn(gomokuApi, "ready").mockResolvedValue({});
  const act = jest.fn((operation) => operation());
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    act,
    room: {
      ...state.room,
      status: "FINISHED",
      hostReady: false,
      winnerMemberId: 1,
      endReason: "FIVE"
    }
  });
  try {
    const { container, rerender } = render(<GomokuRoomPage />);
    const replay = screen.getByRole("button", { name: "다시 대결", exact: true });
    expect(replay).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_ready_toggle");
    fireEvent.click(replay);
    expect(act).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledWith(1, { ready: true, gameNumber: 2 });
    useGomokuRoom.mockReturnValue({
      ...state,
      room: { ...state.room, gameNumber: 2, turnDeadline: Date.now() + 60000 }
    });
    rerender(<GomokuRoomPage />);
    expect(screen.queryByRole("heading", { name: "WIN", exact: true })).not.toBeInTheDocument();
    expect(container.querySelector(".gomoku-board-surface")).not.toHaveAttribute("inert");
    expect(container.querySelector(".gomoku-table")).not.toHaveClass("gomoku-table--covered");
    fireEvent.click(screen.getByRole("button", { name: "H8, 빈 자리" }));
    expect(screen.getByRole("button", { name: "자리하기", exact: true })).toBeEnabled();
  } finally {
    ready.mockRestore();
    useGomokuRoom.mockImplementation(originalHook);
  }
});

test.each([{ connected: false }, { pending: true }, { room: { guestMemberId: null } }])(
  "rematch stays disabled when commands cannot be sent: %o",
  (override) => {
    const state = useGomokuRoom();
    useGomokuRoom.mockReturnValueOnce({
      ...state,
      ...override,
      room: {
        ...state.room,
        status: "FINISHED",
        winnerMemberId: 1,
        endReason: "FIVE",
        ...override.room
      }
    });
    render(<GomokuRoomPage />);
    expect(
      document.querySelector('[data-ph-capture-attribute-action="gomoku_ready_toggle"]')
    ).toBeDisabled();
  }
);

test("room tools use outlined buttons and result omits the resignation explanation", () => {
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    room: { ...state.room, status: "FINISHED", winnerMemberId: 2, endReason: "RESIGN" }
  });
  render(<GomokuRoomPage />);
  expect(screen.queryByRole("button", { name: "규칙", exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "나가기", exact: true })).toHaveClass("ui-button--danger");
  expect(screen.getByRole("link", { name: "대기실", exact: true })).toHaveClass("games-back");
  expect(screen.getByRole("heading", { name: "LOSE", exact: true })).toBeVisible();
  expect(screen.queryByText("기권으로 대결이 끝났어요")).not.toBeInTheDocument();
});

test("waiting room centers preparation on an inert board with red and green readiness", () => {
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    room: { ...state.room, status: "WAITING", hostReady: false, guestReady: true }
  });
  const { container } = render(<GomokuRoomPage />);
  expect(container.querySelector(".gomoku-result")).toContainElement(
    screen.getByRole("button", { name: "준비하기", exact: true })
  );
  expect(screen.getByRole("heading", { name: "대국 준비" })).toBeVisible();
  expect(container.querySelector(".gomoku-board-surface")).toHaveAttribute("inert");
  expect(container.querySelector(".gomoku-table")).toHaveClass("gomoku-table--covered");
  expect(container.querySelector(".gomoku-controls")).not.toBeInTheDocument();
  expect(container.querySelector(".gomoku-status-row")).not.toBeInTheDocument();
  expect(screen.getByText("준비 전")).toHaveClass("gomoku-readiness--unready");
  expect(screen.getByText("준비 완료")).toHaveClass("gomoku-readiness--ready");
  expect(screen.queryByRole("button", { name: "시작하기" })).not.toBeInTheDocument();
});

test("participant GitHub avatars remain visible with color badges after starting", () => {
  const state = useGomokuRoom();
  const originalHook = useGomokuRoom.getMockImplementation();
  const room = {
    ...state.room,
    hostAvatarUrl: "https://avatars.githubusercontent.com/u/12345",
    guestAvatarUrl: "https://avatars.githubusercontent.com/u/67890"
  };
  useGomokuRoom.mockReturnValue({ ...state, room: { ...room, status: "WAITING", gameNumber: 0 } });
  try {
    const { rerender } = render(<GomokuRoomPage />);
    expect(screen.getByRole("img", { name: "흑 프로필" })).toHaveAttribute(
      "src",
      room.hostAvatarUrl
    );
    expect(screen.getByRole("img", { name: "백 프로필" })).toHaveAttribute(
      "src",
      room.guestAvatarUrl
    );
    expect(screen.queryByRole("img", { name: "흑돌", exact: true })).not.toBeInTheDocument();
    useGomokuRoom.mockReturnValue({ ...state, room });
    rerender(<GomokuRoomPage />);
    expect(screen.getByRole("img", { name: "흑 프로필" })).toBeVisible();
    expect(screen.getByRole("img", { name: "백 프로필" })).toBeVisible();
    expect(screen.getByRole("img", { name: "흑돌", exact: true })).toBeVisible();
    expect(screen.getByRole("img", { name: "백돌", exact: true })).toBeVisible();
    fireEvent.error(screen.getByRole("img", { name: "흑 프로필" }));
    expect(screen.queryByRole("img", { name: "흑 프로필" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("흑 프로필")).toHaveTextContent("흑");
  } finally {
    useGomokuRoom.mockImplementation(originalHook);
  }
});

test("an empty guest seat has no fabricated profile image or color badge", () => {
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    room: { ...state.room, status: "WAITING", gameNumber: 0, guestMemberId: null, guestName: null }
  });
  const { container } = render(<GomokuRoomPage />);
  const guest = container.querySelectorAll(".gomoku-players li")[1];
  expect(guest).toHaveTextContent("빈 자리");
  expect(guest.querySelector("img")).toBeNull();
  expect(guest.querySelector(".gomoku-player-color")).toBeNull();
});

test.each(["WAITING", "FINISHED"])("host explicitly starts a fully ready %s room", (status) => {
  const state = useGomokuRoom();
  const start = jest.spyOn(gomokuApi, "start").mockResolvedValue({});
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    act: (operation) => operation(),
    room: { ...state.room, status, hostReady: true, guestReady: true }
  });
  try {
    render(<GomokuRoomPage />);
    expect(start).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "시작하기", exact: true });
    expect(button).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_game_start");
    fireEvent.click(button);
    expect(start).toHaveBeenCalledWith(1, 2);
    expect(screen.getByRole("button", { name: "준비 취소" })).toBeEnabled();
  } finally {
    start.mockRestore();
  }
});

test("guest waits for the host after both participants are ready", () => {
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValueOnce({
    ...state,
    room: {
      ...state.room,
      hostMemberId: 2,
      guestMemberId: 1,
      status: "WAITING",
      hostReady: true,
      guestReady: true
    }
  });
  render(<GomokuRoomPage />);
  expect(screen.getByText("방장이 시작할 때까지 기다려 주세요")).toBeVisible();
  expect(screen.queryByRole("button", { name: "시작하기" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "준비 취소" })).toBeEnabled();
});

test.each([{ connected: false }, { pending: true }])(
  "host start is disabled while commands are locked: %o",
  (override) => {
    const state = useGomokuRoom();
    useGomokuRoom.mockReturnValueOnce({
      ...state,
      ...override,
      room: { ...state.room, status: "WAITING", hostReady: true, guestReady: true }
    });
    render(<GomokuRoomPage />);
    expect(
      document.querySelector('[data-ph-capture-attribute-action="gomoku_game_start"]')
    ).toBeDisabled();
    expect(
      document.querySelector('[data-ph-capture-attribute-action="gomoku_ready_toggle"]')
    ).toBeDisabled();
  }
);

test.each([null, 1])(
  "closed room centers its own notice regardless of earlier winner %s and returns to lobby",
  (winnerMemberId) => {
    const state = useGomokuRoom();
    const navigate = jest.fn();
    useNavigate.mockReturnValueOnce(navigate);
    useGomokuRoom.mockReturnValueOnce({
      ...state,
      connected: false,
      room: { ...state.room, status: "CLOSED", winnerMemberId }
    });
    const { container } = render(<GomokuRoomPage />);
    expect(screen.getByRole("heading", { name: "종료된 방", exact: true })).toHaveTextContent(
      "CLOSED"
    );
    expect(container.querySelector(".gomoku-result")).toHaveTextContent("대기실로");
    expect(container.querySelector(".gomoku-board-surface")).toHaveAttribute("inert");
    expect(container.querySelector(".gomoku-status-row")).not.toBeInTheDocument();
    expect(container.querySelector(".gomoku-controls")).not.toBeInTheDocument();
    expect(screen.queryByText("종료된 방이에요")).not.toBeInTheDocument();
    expect(screen.queryByText("대기실에서 새 방에 참여하세요.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "다시 대결", exact: true })
    ).not.toBeInTheDocument();
    const lobby = screen.getByRole("button", { name: "대기실로", exact: true });
    expect(lobby).toBeEnabled();
    expect(lobby).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_closed_lobby_open");
    fireEvent.click(lobby);
    expect(navigate).toHaveBeenCalledWith("/games/gomoku");
  }
);

test("double-click sends the clicked position and a failed move keeps it for button retry", async () => {
  const state = useGomokuRoom();
  const originalHook = useGomokuRoom.getMockImplementation();
  const move = jest.spyOn(gomokuApi, "move").mockResolvedValue({});
  const act = jest.fn(async (operation) => {
    await operation();
    return false;
  });
  useGomokuRoom.mockReturnValue({
    ...state, act, room: { ...state.room, turnDeadline: Date.now() + 60000 }
  });
  try {
    render(<GomokuRoomPage />);
    fireEvent.click(screen.getByRole("button", { name: "A1, 빈 자리" }));
    expect(move).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByRole("button", { name: "H8, 빈 자리" }));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    const payload = move.mock.calls[0][1];
    expect(payload).toMatchObject({ x: 7, y: 7, gameNumber: 1, expectedPly: 0 });
    expect(payload.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(screen.getByRole("button", { name: "H8, 빈 자리" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "자리하기", exact: true }));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(move.mock.calls[1][1]).toEqual(payload);
  } finally {
    move.mockRestore();
    useGomokuRoom.mockImplementation(originalHook);
  }
});

test.each([
  { connected: false },
  { pending: true },
  { room: { ply: 1 } },
  { room: { turnDeadline: 0 } },
  { room: { status: "WAITING" } },
  { room: { status: "FINISHED" } },
  { room: { status: "CLOSED" } }
])("double-click cannot submit when the room disallows moves: %o", (override) => {
  const state = useGomokuRoom();
  const originalHook = useGomokuRoom.getMockImplementation();
  const act = jest.fn();
  useGomokuRoom.mockReturnValue({
    ...state, ...override, act,
    room: { ...state.room, turnDeadline: Date.now() + 60000, ...override.room }
  });
  try {
    const { container } = render(<GomokuRoomPage />);
    fireEvent.doubleClick(container.querySelectorAll(".gomoku-cell")[112]);
    expect(act).not.toHaveBeenCalled();
  } finally {
    useGomokuRoom.mockImplementation(originalHook);
  }
});

test.each([0, 1])("only the current player's profile is highlighted at ply %i", (ply) => {
  const state = useGomokuRoom();
  useGomokuRoom.mockReturnValueOnce({ ...state, room: { ...state.room, ply } });
  const { container } = render(<GomokuRoomPage />);
  const active = container.querySelectorAll(".gomoku-player--active");
  expect(active).toHaveLength(1);
  expect(active[0]).toHaveTextContent(ply === 0 ? "내 차례" : "상대 차례");
  expect(screen.queryByText(/^(내|상대) 차례예요$/)).not.toBeInTheDocument();
  expect(within(active[0]).getByText(ply === 0 ? "흑 (나)" : "백", { selector: "strong" })).toBeVisible();
  expect(container.querySelectorAll(".gomoku-player:not(.gomoku-player--active)")).toHaveLength(1);
  expect(within(container.querySelector(".gomoku-player:not(.gomoku-player--active)")).queryByText("대기")).not.toBeInTheDocument();
});

test("room error can be dismissed without clearing selection and a repeated error is announced again", () => {
  const state = useGomokuRoom();
  const originalHook = useGomokuRoom.getMockImplementation();
  const error = "흑은 쌍3, 쌍4, 장목 자리에 놓을 수 없어요. 다른 자리를 선택해 주세요.";
  useGomokuRoom.mockReturnValue({ ...state, error, room: { ...state.room, turnDeadline: Date.now() + 60000 } });
  try {
    const { rerender } = render(<GomokuRoomPage />);
    fireEvent.click(screen.getByRole("button", { name: "H8, 빈 자리" }));
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    screen.getByRole("button", { name: "H8, 빈 자리" }).focus();
    const dismiss = screen.getByRole("button", { name: "오류 알림 닫기" });
    expect(dismiss).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_error_dismiss");
    fireEvent.click(dismiss);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "H8, 빈 자리" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "H8, 빈 자리" })).toHaveAttribute("aria-pressed", "true");
    useGomokuRoom.mockReturnValue({ ...state, error: null });
    rerender(<GomokuRoomPage />);
    useGomokuRoom.mockReturnValue({ ...state, error });
    rerender(<GomokuRoomPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
  } finally {
    useGomokuRoom.mockImplementation(originalHook);
  }
});
