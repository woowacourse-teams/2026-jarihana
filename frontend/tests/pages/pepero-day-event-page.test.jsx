import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { storeReturnTarget, useAuth } from "../../src/features/auth";
import { getPeperoDayRankings, getPeperoDayStatus } from "../../src/features/pepero-day/api";
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
  getPeperoDayRankings: jest.fn(),
  getPeperoDayStatus: jest.fn()
}));

const login = jest.fn();
const status = (overrides) => ({
  closesAt: "2026-11-12T10:00:00",
  dailyAttemptLimit: 3,
  gameRoomOpen: false,
  gameRoomOpensAt: "2026-11-12T13:00:00",
  opensAt: "2026-11-11T00:00:00",
  remainingAttempts: null,
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

it("offers practice to everyone and asks anonymous visitors to log in for ranked runs", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  mount();

  expect(await screen.findByRole("heading", { name: "공평하게 반띵" })).toBeInTheDocument();
  expect(screen.getByText(/11월 11일 00:00 ~ 11월 12일 10:00/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "연습 시작" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "pepero_practice_start"
  );
  fireEvent.click(screen.getByRole("button", { name: "GitHub로 로그인하고 도전하기" }));
  expect(storeReturnTarget).toHaveBeenCalledWith("/events/pepero-day");
  expect(login).toHaveBeenCalled();
  expect(await screen.findByText("모카")).toBeInTheDocument();
});

it("plays a practice stick in the browser and reveals the answer after cutting", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  mount();

  fireEvent.click(await screen.findByRole("button", { name: "연습 시작" }));
  expect(await screen.findByRole("region", { name: "무게표" })).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "칼 위치, 막대 왼쪽 끝부터 cm" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "자르기" }));

  expect(await screen.findByText(/왼쪽 끝부터 정답/)).toBeInTheDocument();
  expect(screen.getByLabelText("양쪽 조각의 무게 구성")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다음 막대" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "stick_next_round"
  );
});

it("opens the ranking dialog after five practice sticks and points to the ranked mode", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  mount();

  fireEvent.click(await screen.findByRole("button", { name: "연습 시작" }));
  for (let round = 1; round <= 5; round += 1) {
    fireEvent.click(await screen.findByRole("button", { name: "자르기" }));
    fireEvent.click(await screen.findByRole("button", { name: round === 5 ? "최종 결과 보기" : "다음 막대" }));
  }

  const dialog = await screen.findByRole("dialog", { name: "연습 결과" });
  expect(dialog).toHaveTextContent(/연습 점수는 순위에 들어가지 않아요\. 이 점수였다면 \d+위예요\./);
  expect(within(dialog).getByText("모카")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "순위 도전하러 가기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "GitHub로 로그인하고 도전하기" })).toBeInTheDocument();
});

it("moves the knife with the arrow keys even when the stick is not focused, one step per press", async () => {
  getPeperoDayStatus.mockResolvedValue(status());
  const { container } = mount();

  fireEvent.click(await screen.findByRole("button", { name: "연습 시작" }));
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

it("shows remaining attempts and blocks ranked runs when none are left", async () => {
  useAuth.mockReturnValue({ login, member: { id: 7 }, status: "authenticated" });
  getPeperoDayStatus.mockResolvedValue(status({ remainingAttempts: 0 }));
  mount();

  expect(await screen.findByText("0번")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "순위 도전 시작" })).toBeDisabled();
});

it("shows only a countdown before the event opens", async () => {
  getPeperoDayStatus.mockResolvedValue(status({ serverTime: "2026-11-10T23:00:00", status: "UPCOMING" }));
  mount();

  expect(await screen.findByText("11월 11일 00:00에 열려요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "연습 시작" })).not.toBeInTheDocument();
  expect(getPeperoDayRankings).not.toHaveBeenCalled();
});

it("lets a game in progress finish when the event closes mid-play", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getPeperoDayStatus.mockResolvedValue(status());
  mount(client);

  fireEvent.click(await screen.findByRole("button", { name: "연습 시작" }));
  expect(await screen.findByRole("button", { name: "자르기" })).toBeInTheDocument();

  getPeperoDayStatus.mockResolvedValue(status({ serverTime: "2026-11-12T10:00:01", status: "CLOSED" }));
  await act(() => client.invalidateQueries());

  expect(await screen.findByText("하던 판은 끝까지 할 수 있어요. 순위 도전 판은 끝내면 순위에 들어가요.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "자르기" }));
  expect(await screen.findByRole("button", { name: "다음 막대" })).toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: "연습 시작" })).not.toBeInTheDocument();
  expect(await screen.findByText("4,820점")).toBeInTheDocument();
});
