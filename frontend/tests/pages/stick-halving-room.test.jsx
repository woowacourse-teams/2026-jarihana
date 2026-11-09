import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { storeReturnTarget, useAuth } from "../../src/features/auth";
import { getPeperoDayRankings, getPeperoDayStatus, getStickHalvingRoomRankings } from "../../src/features/pepero-day/api";
import { GamesPage } from "../../src/pages/games/index.jsx";
import { StickHalvingRoomPage } from "../../src/pages/games/StickHalvingRoomPage.jsx";
import { ToastProvider } from "../../src/shared/ui";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => jest.fn(),
  useParams: () => ({})
}));
jest.mock("../../src/features/auth", () => ({ storeReturnTarget: jest.fn(), useAuth: jest.fn() }));
jest.mock("../../src/features/pepero-day/api", () => ({
  ...jest.requireActual("../../src/features/pepero-day/api"),
  getPeperoDayRankings: jest.fn(),
  getPeperoDayStatus: jest.fn(),
  getStickHalvingRoomRankings: jest.fn()
}));

const status = (overrides) => ({
  closesAt: "2026-11-12T10:00:00",
  gameRoomOpen: false,
  gameRoomOpensAt: "2026-11-12T13:00:00",
  opensAt: "2026-11-11T00:00:00",
  serverTime: "2026-11-12T11:00:00",
  status: "CLOSED",
  ...overrides
});

function mount(page) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{page}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ login: jest.fn(), member: null, status: "anonymous" });
  getPeperoDayRankings.mockResolvedValue({
    items: [{ nickname: "모카", rank: 1, totalDurationMillis: 41200, totalScore: 4820 }],
    me: null
  });
  getStickHalvingRoomRankings.mockResolvedValue({
    items: [{ nickname: "라온", rank: 1, totalDurationMillis: 30100, totalScore: 5000 }],
    me: null
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("shows the stick halving card in the game room only after the move time, without a reload", async () => {
  jest.spyOn(Math, "random").mockReturnValue(0);
  getPeperoDayStatus.mockResolvedValueOnce(status({ serverTime: "2026-11-12T12:59:59" }));
  getPeperoDayStatus.mockResolvedValue(status({ gameRoomOpen: true, serverTime: "2026-11-12T13:00:00" }));
  mount(<GamesPage />);

  expect(screen.getByRole("heading", { name: "오목" })).toBeInTheDocument();
  await waitFor(() => expect(getPeperoDayStatus).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("heading", { name: "공평하게 반띵" })).not.toBeInTheDocument();

  // 서버 시각으로 1초 뒤가 옮기는 시각이라, 그때 상태를 다시 받아 카드가 나타난다.
  expect(await screen.findByRole("heading", { name: "공평하게 반띵" }, { timeout: 5000 })).toBeInTheDocument();
  expect(getPeperoDayStatus).toHaveBeenCalledTimes(2);
  const links = screen.getAllByRole("link", { name: "게임 시작" });
  expect(links.map((link) => link.getAttribute("href"))).toEqual(["/games/gomoku", "/games/stick-halving", "/games/rhythm-harpoon"]);
  expect(links[1]).toHaveAttribute("data-ph-capture-attribute-action", "stick_halving_room_open");
}, 10_000);

it("tells when the game arrives before the move time", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  mount(<StickHalvingRoomPage />);

  expect(await screen.findByText("아직 게임방에 없는 게임이에요")).toBeInTheDocument();
  expect(screen.getByText("11월 12일 13:00부터 게임방에서 할 수 있어요.")).toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

it("shows the game room ranking apart from the final event ranking and plays practice sticks", async () => {
  getPeperoDayStatus.mockResolvedValue(status({ gameRoomOpen: true, serverTime: "2026-11-12T13:00:00" }));
  mount(<StickHalvingRoomPage />);

  expect(await screen.findByRole("heading", { name: "공평하게 반띵" })).toBeInTheDocument();
  const roomRanking = await screen.findByRole("region", { name: "게임방 순위" });
  const eventRanking = await screen.findByRole("region", { name: "이벤트 최종 순위" });
  expect(await within(roomRanking).findByText("라온")).toBeInTheDocument();
  expect(within(roomRanking).queryByText("모카")).not.toBeInTheDocument();
  expect(await within(eventRanking).findByText("모카")).toBeInTheDocument();
  expect(within(eventRanking).queryByText("라온")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "연습 시작" }));
  expect(await screen.findByRole("slider", { name: "칼 위치, 막대 왼쪽 끝부터 cm" })).toBeInTheDocument();
  expect(screen.getByText("연습")).toBeInTheDocument();
});

it("offers unlimited game room ranked runs to members and a login to visitors", async () => {
  getPeperoDayStatus.mockResolvedValue(status({ gameRoomOpen: true, serverTime: "2026-11-12T13:00:00" }));
  const login = jest.fn();
  useAuth.mockReturnValue({ login, member: null, status: "anonymous" });
  const { unmount } = mount(<StickHalvingRoomPage />);

  expect(await screen.findByText(/횟수 제한 없이 몇 번이든 도전할 수 있고, 가장 좋은 기록으로 게임방 순위를 매겨요/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "GitHub로 로그인하고 도전하기" }));
  expect(storeReturnTarget).toHaveBeenCalledWith("/games/stick-halving");
  expect(login).toHaveBeenCalled();
  unmount();

  useAuth.mockReturnValue({ login, member: { id: 7 }, status: "authenticated" });
  mount(<StickHalvingRoomPage />);
  expect(await screen.findByRole("button", { name: "순위 도전 시작" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "stick_halving_room_ranked_start"
  );
});
