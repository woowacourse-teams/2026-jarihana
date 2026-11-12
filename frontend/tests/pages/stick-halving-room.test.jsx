import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { storeReturnTarget, useAuth } from "../../src/features/auth";
import {
  createRankedAdapter,
  getPeperoDayRankings,
  getPeperoDayStatus,
  getStickHalvingRoomRankings
} from "../../src/features/pepero-day/api";
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
  // 서버 대신 브라우저에서 같은 규칙으로 막대를 만들고 판정하는 연결부로 순위 도전을 흉내 낸다.
  createRankedAdapter: jest.fn(() =>
    jest.requireActual("../../src/features/stick-halving/practiceAdapter").createPracticeAdapter()
  ),
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
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/games/chair-stack", "/games/gomoku", "/games/stick-halving", "/games/rhythm-harpoon"
  ]);
  expect(links[2]).toHaveAttribute("data-ph-capture-attribute-action", "stick_halving_room_open");
}, 10_000);

it("tells when the game arrives before the move time", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  mount(<StickHalvingRoomPage />);

  expect(await screen.findByText("아직 게임방에 없는 게임이에요")).toBeInTheDocument();
  expect(screen.getByText("11월 12일 13:00부터 게임방에서 할 수 있어요.")).toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

const asMember = () => useAuth.mockReturnValue({ login: jest.fn(), member: { id: 7 }, status: "authenticated" });
const openRoom = () => getPeperoDayStatus.mockResolvedValue(status({ gameRoomOpen: true, serverTime: "2026-11-12T13:00:00" }));

it("shows the game room ranking apart from the final event ranking", async () => {
  openRoom();
  mount(<StickHalvingRoomPage />);

  expect(await screen.findByRole("heading", { name: "공평하게 반띵" })).toBeInTheDocument();
  const roomRanking = await screen.findByRole("region", { name: "게임방 순위" });
  const eventRanking = await screen.findByRole("region", { name: "이벤트 최종 순위" });
  expect(await within(roomRanking).findByText("라온")).toBeInTheDocument();
  expect(within(roomRanking).queryByText("모카")).not.toBeInTheDocument();
  expect(await within(eventRanking).findByText("모카")).toBeInTheDocument();
  expect(within(eventRanking).queryByText("라온")).not.toBeInTheDocument();
});

it("starts a game room ranked run right from the start card, like the event, with no practice mode", async () => {
  openRoom();
  asMember();
  const { container } = mount(<StickHalvingRoomPage />);

  // 이벤트 시작 카드처럼 반으로 잘린 막대 그림과 시작하기만 있다.
  const startButton = await screen.findByRole("button", { name: "시작하기" });
  expect(startButton).toHaveAttribute("data-ph-capture-attribute-action", "stick_halving_room_ranked_start");
  expect(container.querySelector(".cut-stick-artwork")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "10초 안에 빼빼로 5개를 같은 무게로 잘라 보세요" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /연습/ })).not.toBeInTheDocument();

  fireEvent.click(startButton);
  expect(await screen.findByRole("slider", { name: "칼 위치, 막대 왼쪽 끝부터 cm" })).toBeInTheDocument();
  expect(createRankedAdapter).toHaveBeenCalledWith({ board: "room" });
  expect(container.querySelector(".cut-stick-artwork")).not.toBeInTheDocument();
});

it("starts over from the first stick with the restart button or the R key", async () => {
  openRoom();
  asMember();
  mount(<StickHalvingRoomPage />);
  fireEvent.click(await screen.findByRole("button", { name: "시작하기" }));

  // 첫 막대를 자르고 두 번째 막대를 받은 뒤 처음부터 다시 한다. 다시 할 때마다 새 순위 도전 판을 받는다.
  fireEvent.click(await screen.findByRole("button", { name: "자르기" }));
  fireEvent.click(await screen.findByRole("button", { name: "다음 막대" }));
  await waitFor(() => expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^2\/5/));
  fireEvent.click(screen.getByRole("button", { name: "처음부터 다시 하기" }));
  await waitFor(() => expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^1\/5.*누적 0점/));
  expect(createRankedAdapter).toHaveBeenCalledTimes(2);

  // R 키도 같다.
  fireEvent.click(await screen.findByRole("button", { name: "자르기" }));
  fireEvent.click(await screen.findByRole("button", { name: "다음 막대" }));
  await waitFor(() => expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^2\/5/));
  fireEvent.keyDown(window, { code: "KeyR", key: "r" });
  await waitFor(() => expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^1\/5.*누적 0점/));
  expect(createRankedAdapter).toHaveBeenCalledTimes(3);
});

it("shows the game room standing after five sticks, with no practice comparison", async () => {
  openRoom();
  asMember();
  getStickHalvingRoomRankings.mockResolvedValue({
    items: [{ nickname: "라온", rank: 1, totalDurationMillis: 30100, totalScore: 5000 }],
    me: { nickname: "요크", rank: 2, totalDurationMillis: 41000, totalScore: 4000 }
  });
  mount(<StickHalvingRoomPage />);
  fireEvent.click(await screen.findByRole("button", { name: "시작하기" }));

  for (let round = 1; round <= 5; round += 1) {
    fireEvent.click(await screen.findByRole("button", { name: "자르기" }));
    fireEvent.click(await screen.findByRole("button", { name: round < 5 ? "다음 막대" : "최종 결과 보기" }));
  }

  const dialog = await screen.findByRole("dialog", { name: "순위 도전 결과" });
  expect(await within(dialog).findByText((_, element) => element?.textContent?.startsWith("내 순위 2위") ?? false, {
    selector: "p"
  })).toBeInTheDocument();
  expect(within(dialog).queryByText(/순위 도전이었다면/)).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "순위 도전하러 가기" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "새 막대로 다시 도전" })).toBeInTheDocument();
});

it("asks visitors to log in and come back to the game room", async () => {
  openRoom();
  const login = jest.fn();
  useAuth.mockReturnValue({ login, member: null, status: "anonymous" });
  mount(<StickHalvingRoomPage />);

  const loginButton = await screen.findByRole("button", { name: "GitHub로 로그인하고 도전하기" });
  expect(loginButton).toHaveAttribute("data-ph-capture-attribute-action", "stick_halving_room_login");
  expect(screen.queryByRole("button", { name: "시작하기" })).not.toBeInTheDocument();
  fireEvent.click(loginButton);
  expect(storeReturnTarget).toHaveBeenCalledWith("/games/stick-halving");
  expect(login).toHaveBeenCalled();
  expect(createRankedAdapter).not.toHaveBeenCalled();
});
