import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { GomokuLobbyPage } from "./index";
import { gomokuApi } from "../../features/gomoku/api";
import { storeReturnTarget } from "../../features/auth";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const root = dirname(require.resolve("react-router/package.json"));
  const hooks = jest.requireActual(join(root, "dist/production/lib/hooks.js"));
  return {
    ...jest.requireActual(join(root, "dist/production/lib/components.js")),
    ...jest.requireActual(join(root, "dist/production/lib/hooks.js")),
    useSearchParams: () => {
      const location = hooks.useLocation();
      const navigate = hooks.useNavigate();
      const params = new URLSearchParams(location.search);
      return [
        params,
        (next) =>
          navigate({
            search: `?${typeof next === "function" ? next(params) : new URLSearchParams(next)}`
          })
      ];
    },
    Link: ({ children, to, ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )
  };
});
let mockAuth;
jest.mock("../../features/auth", () => ({ useAuth: () => mockAuth, storeReturnTarget: jest.fn() }));

const stats = { total: 24, wins: 15, losses: 7, draws: 2, winRate: 62.5 };
const record = {
  id: 1,
  opponentName: "가온",
  opponentAvatarUrl: null,
  result: "WIN",
  rule: "RENJU",
  endReason: "FIVE",
  endedAt: "2026-11-04T19:42:00"
};
const ranks = [1, 2, 3, 4].map((id) => ({
  ...stats,
  memberId: id,
  rank: id,
  name: ["가온", "해솔", "여울", "나루"][id - 1],
  avatarUrl: `https://avatars.githubusercontent.com/u/${id}`
}));
function Location() {
  return <output aria-label="현재 경로">{useLocation().search}</output>;
}
function setup(path = "/games/gomoku") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <GomokuLobbyPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(view()), view, client };
}
beforeEach(() => {
  mockAuth = { member: { id: 1 }, status: "authenticated", sessionVersion: 0, login: jest.fn() };
  jest.spyOn(gomokuApi, "list").mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  jest.spyOn(gomokuApi, "mine").mockResolvedValue({ roomId: null });
  jest.spyOn(gomokuApi, "statistics").mockResolvedValue(stats);
  jest
    .spyOn(gomokuApi, "history")
    .mockResolvedValue({ items: [record], hasNext: false, nextCursor: null });
  jest
    .spyOn(gomokuApi, "ranking")
    .mockResolvedValue({ items: ranks, me: ranks[0], hasNext: false, nextCursor: null });
});
afterEach(() => jest.restoreAllMocks());

test("keeps the original artwork and fetches private records only when its URL tab is selected", async () => {
  const { container } = setup();
  await screen.findByText("아직 기다리는 방이 없어요");
  expect(container.querySelector(".games-lobby-heading__art img")).toHaveAttribute(
    "src",
    expect.stringContaining("gomoku-lounge-v1.webp")
  );
  expect(screen.queryByText("친구와 함께하는 오목")).not.toBeInTheDocument();
  expect(gomokuApi.statistics).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "내 전적" }));
  expect(await screen.findByText("24판의 기록")).toBeVisible();
  expect(screen.getByLabelText("승률 62.5퍼센트")).toBeVisible();
  expect(screen.getByLabelText("현재 경로")).toHaveTextContent("?tab=history");
  expect(screen.getByText("오목 완성")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "랭킹" }));
  expect(await screen.findByText("승리의 자리")).toBeVisible();
  expect(screen.getByRole("img", { name: "자리하나 시그니처 의자" })).toBeVisible();
  expect(
    within(screen.getByLabelText("상위 세 명")).getByRole("img", { name: "가온 프로필" })
  ).toHaveAttribute("src", ranks[0].avatarUrl);
  expect(screen.getByRole("tab", { name: "랭킹" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "gomoku_lobby_tab_ranking"
  );
});

test("no finished games shows an undefined rate and offers a return to waiting rooms", async () => {
  gomokuApi.statistics.mockResolvedValue({ total: 0, wins: 0, losses: 0, draws: 0, winRate: null });
  gomokuApi.history.mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  setup("/games/gomoku?tab=history");
  expect(await screen.findByText("0판의 기록")).toBeVisible();
  expect(screen.getByLabelText("아직 대국 기록이 없습니다")).toHaveTextContent("-");
  fireEvent.click(screen.getByRole("button", { name: "대기방 둘러보기" }));
  expect(screen.getByRole("tab", { name: "대기방" })).toHaveAttribute("aria-selected", "true");
});

test("anonymous history never fetches private data and login preserves its return tab", async () => {
  mockAuth = { status: "anonymous", member: null, login: jest.fn() };
  setup("/games/gomoku?tab=history");
  fireEvent.click(await screen.findByRole("button", { name: "로그인하기" }));
  expect(storeReturnTarget).toHaveBeenCalledWith("/games/gomoku?tab=history");
  expect(mockAuth.login).toHaveBeenCalled();
  expect(gomokuApi.statistics).not.toHaveBeenCalled();
  expect(gomokuApi.history).not.toHaveBeenCalled();
});

test("account changes cannot display the previous account's summary", async () => {
  const rendered = setup("/games/gomoku?tab=history");
  await screen.findByText("24판의 기록");
  mockAuth = { ...mockAuth, member: { id: 2 }, sessionVersion: 1 };
  gomokuApi.statistics.mockResolvedValue({ total: 0, wins: 0, losses: 0, draws: 0, winRate: null });
  gomokuApi.history.mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  rendered.rerender(rendered.view());
  await waitFor(() => expect(screen.getByText("0판의 기록")).toBeVisible());
  expect(screen.queryByText("24판의 기록")).not.toBeInTheDocument();
});

test("a failed next page preserves existing matches and retries that cursor", async () => {
  gomokuApi.history
    .mockResolvedValueOnce({ items: [record], hasNext: true, nextCursor: "next" })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      items: [{ ...record, id: 2, opponentName: "해솔" }],
      hasNext: false,
      nextCursor: null
    });
  setup("/games/gomoku?tab=history");
  fireEvent.click(await screen.findByRole("button", { name: "기록 더 보기" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText("가온")).toBeVisible();
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("해솔")).toBeVisible();
  expect(gomokuApi.history).toHaveBeenLastCalledWith("next", expect.any(AbortSignal));
});
