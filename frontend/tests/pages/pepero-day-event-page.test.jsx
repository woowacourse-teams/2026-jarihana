import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { storeReturnTarget, useAuth } from "../../src/features/auth";
import { createRankedAdapter, getPeperoDayRankings, getPeperoDayStatus } from "../../src/features/pepero-day/api";
import { PeperoDayEventPage } from "../../src/pages/events/PeperoDayEventPage.jsx";
import { ToastProvider } from "../../src/shared/ui";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}));
jest.mock("../../src/features/auth", () => ({ storeReturnTarget: jest.fn(), useAuth: jest.fn() }));
jest.mock("../../src/features/pepero-day/api", () => ({
  ...jest.requireActual("../../src/features/pepero-day/api"),
  // 서버 대신 브라우저에서 같은 규칙으로 막대를 만들고 판정하는 연결부로 순위 도전을 흉내 낸다.
  createRankedAdapter: jest.fn(() =>
    jest.requireActual("../../src/features/stick-halving/practiceAdapter").createPracticeAdapter()
  ),
  getPeperoDayRankings: jest.fn(),
  getPeperoDayStatus: jest.fn()
}));

const login = jest.fn();
const startRun = async () => fireEvent.click(await screen.findByRole("button", { name: "시작하기" }));
const asMember = () => useAuth.mockReturnValue({ login, member: { id: 7 }, status: "authenticated" });
const status = (overrides) => ({
  closesAt: "2026-11-12T10:00:00",
  gameRoomOpen: false,
  gameRoomOpensAt: "2026-11-12T13:00:00",
  opensAt: "2026-11-11T00:00:00",
  serverTime: "2026-11-11T12:00:00",
  status: "OPEN",
  ...overrides
});

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PeperoDayEventPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ login, member: null, status: "anonymous" });
  getPeperoDayRankings.mockResolvedValue({
    items: [{ nickname: "모카", rank: 1, totalDurationMillis: 41200, totalScore: 4820 }],
    me: null
  });
});

it("asks anonymous visitors to log in instead of offering a practice run", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  mount();

  expect(await screen.findByRole("heading", { name: "공평하게 반띵" })).toBeInTheDocument();
  expect(screen.getByText(/11월 11일 00:00 ~ 11월 12일 10:00/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "연습 시작" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "자르기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "GitHub로 로그인하고 도전하기" }));
  expect(storeReturnTarget).toHaveBeenCalledWith("/events/pepero-day");
  expect(login).toHaveBeenCalled();
  expect(await screen.findByText("모카")).toBeInTheDocument();
  expect(createRankedAdapter).not.toHaveBeenCalled();
});

it("starts a ranked run when a member presses start and reveals the answer after cutting", async () => {
  asMember();
  getPeperoDayStatus.mockResolvedValue(status());
  mount();
  expect(await screen.findByRole("heading", { name: "10초 안에 빼빼로 5개를 같은 무게로 잘라 보세요" })).toBeInTheDocument();
  expect(createRankedAdapter).not.toHaveBeenCalled();
  await startRun();

  expect(await screen.findByRole("slider", { name: "칼 위치, 막대 왼쪽 끝부터 cm" })).toBeInTheDocument();
  expect(createRankedAdapter).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("순위 도전")).not.toBeInTheDocument();
  expect(screen.queryByText(/남은 도전/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "자르기" }));

  expect(await within(screen.getByRole("region", { name: "게임" })).findByRole("status")).toHaveTextContent(/\+\d+점/);
  expect(within(screen.getByRole("region", { name: "게임" })).getByText(/^오차 \d/)).toBeInTheDocument();
  expect(screen.queryByText(/^정답/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "분석하기" }));
  const analysis = await screen.findByRole("dialog", { name: "1번 막대 분석" });
  expect(within(analysis).getByText("정답")).toBeInTheDocument();
  expect(within(analysis).getByText("내가 자른 곳")).toBeInTheDocument();
  fireEvent.click(within(analysis).getAllByRole("button", { name: "닫기" }).at(-1));
  expect(screen.getByRole("button", { name: "다음 막대" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "stick_next_round"
  );
});

it("opens the ranked result dialog after five sticks and starts a new run from the final screen", async () => {
  asMember();
  getPeperoDayStatus.mockResolvedValue(status());
  mount();
  await startRun();

  for (let round = 1; round <= 5; round += 1) {
    fireEvent.click(await screen.findByRole("button", { name: "자르기" }));
    fireEvent.click(await screen.findByRole("button", { name: round === 5 ? "최종 결과 보기" : "다음 막대" }));
  }

  const dialog = await screen.findByRole("dialog", { name: "순위 도전 결과" });
  expect(await within(dialog).findByText("모카")).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "순위 도전하러 가기" })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getAllByRole("button", { name: "닫기" }).at(-1));

  fireEvent.click(screen.getByRole("button", { name: "새 막대로 다시 도전" }));
  expect(await screen.findByRole("button", { name: "자르기" })).toBeInTheDocument();
  expect(createRankedAdapter).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^1\/5/);
});

it("moves the knife with the arrow keys even when the stick is not focused, one step per press", async () => {
  asMember();
  getPeperoDayStatus.mockResolvedValue(status());
  const { container } = mount();
  await startRun();

  const slider = await screen.findByRole("slider", { name: "칼 위치, 막대 왼쪽 끝부터 cm" });
  const knifeX = () => Number(container.querySelector(".stick-board__knife").getAttribute("transform").match(/[\d.]+/)[0]);
  const stepUnits = 952 / 12 / 48;

  const start = knifeX();
  fireEvent.keyDown(document.body, { key: "ArrowRight" });
  expect(knifeX() - start).toBeCloseTo(stepUnits, 6);
  fireEvent.keyDown(document.body, { key: "ArrowLeft", shiftKey: true });
  expect(knifeX() - start).toBeCloseTo(-11 * stepUnits, 6);

  slider.focus();
  const focused = knifeX();
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(knifeX() - focused).toBeCloseTo(stepUnits, 6);

  fireEvent.keyDown(document.body, { ctrlKey: true, key: "ArrowRight" });
  expect(knifeX() - focused).toBeCloseTo(stepUnits, 6);
});

it("cuts with Enter without focusing the stick, but not while another button has focus", async () => {
  asMember();
  getPeperoDayStatus.mockResolvedValue(status());
  mount();
  await startRun();

  await screen.findByRole("slider", { name: "칼 위치, 막대 왼쪽 끝부터 cm" });

  fireEvent.keyDown(screen.getByRole("button", { name: "자르기" }), { key: "Enter" });
  expect(screen.queryByRole("button", { name: "다음 막대" })).not.toBeInTheDocument();

  fireEvent.keyDown(document.body, { key: "Enter", repeat: true });
  expect(screen.queryByRole("button", { name: "다음 막대" })).not.toBeInTheDocument();

  fireEvent.keyDown(document.body, { key: "Enter" });
  expect(await screen.findByRole("button", { name: "다음 막대" })).toBeInTheDocument();
});

it("shows only a countdown before the event opens", async () => {
  getPeperoDayStatus.mockResolvedValue(status({ serverTime: "2026-11-10T23:00:00", status: "UPCOMING" }));
  mount();

  expect(await screen.findByText("11월 11일 00:00에 열려요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "GitHub로 로그인하고 도전하기" })).not.toBeInTheDocument();
  expect(getPeperoDayRankings).not.toHaveBeenCalled();
});

it("lets a game in progress finish when the event closes mid-play", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  asMember();
  getPeperoDayStatus.mockResolvedValue(status());
  mount(client);
  await startRun();

  expect(await screen.findByRole("button", { name: "자르기" })).toBeInTheDocument();

  getPeperoDayStatus.mockResolvedValue(status({ serverTime: "2026-11-12T10:00:01", status: "CLOSED" }));
  await act(() => client.invalidateQueries());

  expect(await screen.findByText("하던 판은 끝까지 할 수 있어요. 순위 도전 판은 끝내면 순위에 들어가요.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "자르기" }));
  expect(await screen.findByRole("button", { name: "다음 막대" })).toBeInTheDocument();
});

it("keeps the game in progress when refreshing the status fails around closing time", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  asMember();
  getPeperoDayStatus.mockResolvedValue(status());
  mount(client);
  await startRun();

  fireEvent.click(await screen.findByRole("button", { name: "자르기" }));
  const next = await screen.findByRole("button", { name: "다음 막대" });

  getPeperoDayStatus.mockRejectedValue(new Error("network"));
  await act(() => client.invalidateQueries());

  expect(client.getQueryState(["pepero-day", "status", "member-7"]).status).toBe("error");
  expect(screen.queryByText("이벤트를 불러오지 못했어요")).not.toBeInTheDocument();
  fireEvent.click(next);
  expect(await screen.findByRole("button", { name: "자르기" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "게임" })).toHaveTextContent(/^2\/5/);
});

it("tells when the game moves to the game room, then links there once it has", async () => {
  getPeperoDayStatus.mockResolvedValue(status({ serverTime: "2026-11-12T11:00:00", status: "CLOSED" }));
  const { unmount } = mount();

  expect(await screen.findByText("참여해 주셔서 고마워요. 11월 12일 13:00부터 게임방에서 다시 할 수 있어요.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "게임방에서 하기" })).not.toBeInTheDocument();
  unmount();

  getPeperoDayStatus.mockResolvedValue(status({ gameRoomOpen: true, serverTime: "2026-11-12T13:00:00", status: "CLOSED" }));
  mount();

  const link = await screen.findByRole("link", { name: "게임방에서 하기" });
  expect(link).toHaveAttribute("href", "/games/stick-halving");
  expect(link).toHaveAttribute("data-ph-capture-attribute-action", "stick_halving_room_open");
});

it("keeps the final ranking after the event closes", async () => {
  getPeperoDayStatus.mockResolvedValue(status({ serverTime: "2026-11-12T11:00:00", status: "CLOSED" }));
  mount();

  expect(await screen.findByRole("heading", { name: "이벤트가 끝났어요" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "GitHub로 로그인하고 도전하기" })).not.toBeInTheDocument();
  expect(await screen.findByText("4,820점")).toBeInTheDocument();
});
