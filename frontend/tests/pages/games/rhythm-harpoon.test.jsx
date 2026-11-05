import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { GamesPage } from "../../../src/pages/games/index.jsx";
import { RhythmHarpoonPage } from "../../../src/pages/games/RhythmHarpoonPage.jsx";
import { mountPracticeGame } from "../../../src/features/game/rhythm/mount-practice-game.mjs";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  useNavigate: () => jest.fn(),
  useParams: () => ({})
}));
jest.mock("../../../src/features/auth", () => ({
  storeReturnTarget: jest.fn(),
  useAuth: () => ({ status: "anonymous" })
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(() => ({ data: undefined, isPending: false, isError: false })),
  useQueryClient: jest.fn(() => ({}))
}));
jest.mock("../../../src/features/game/rhythm/mount-practice-game.mjs", () => ({
  mountPracticeGame: jest.fn()
}));

beforeEach(() => mountPracticeGame.mockReset());

it("opens the rhythm game from the game catalog without loading it in the catalog", () => {
  render(<GamesPage />);
  const card = screen.getByRole("heading", { name: "행성이의 리듬 작살" }).closest("article");
  expect(card).not.toHaveClass("games-card--soon");
  const start = Array.from(card.querySelectorAll("a")).find((link) =>
    link.textContent.includes("게임 시작")
  );
  expect(start).toHaveAttribute("href", "/games/rhythm-harpoon");
  expect(start).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_game_open");
  expect(screen.queryByText("준비 중")).not.toBeInTheDocument();
  expect(mountPracticeGame).not.toHaveBeenCalled();
});

it("returns to the game catalog with the shared back action", () => {
  render(<RhythmHarpoonPage />);
  const back = screen.getByRole("link", { name: "게임방" });
  expect(back).toHaveAttribute("href", "/games");
  expect(back).toHaveAttribute("data-ph-capture-attribute-action", "games_back");
});

it("renders a React-owned game and excludes prototype shortcuts from the service", () => {
  render(<RhythmHarpoonPage />);
  expect(screen.getByRole("application")).toBeInTheDocument();
  expect(document.querySelector("iframe")).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("연습 플레이");
  expect(screen.getByText("연습 점수")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Easy 라이프 10" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(screen.queryByLabelText("오토 감상")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("시작 구간")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("시작 루프")).not.toBeInTheDocument();
  const settings = mountPracticeGame.mock.calls[0][0];
  expect(Object.keys(settings).sort()).toEqual(["onError", "onReady", "root"]);
  expect(settings.root).toContainElement(screen.getByRole("application"));
  act(() => settings.onReady());
  expect(settings.root).toHaveAttribute("aria-busy", "false");
});

it("cleans up the previous runtime before retrying a failed load", () => {
  const dispose = jest.fn();
  mountPracticeGame.mockReturnValue(dispose);
  render(<RhythmHarpoonPage />);
  const previous = mountPracticeGame.mock.calls[0][0];
  act(() => previous.onError());
  expect(screen.getByRole("alert")).toHaveTextContent("게임을 불러오지 못했어요");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(mountPracticeGame).toHaveBeenCalledTimes(2);
  expect(mountPracticeGame.mock.calls[1][0].root).not.toBe(previous.root);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("cleans up on StrictMode reinitialization and on leaving the route", () => {
  const dispose = jest.fn();
  mountPracticeGame.mockReturnValue(dispose);
  const view = render(
    <StrictMode>
      <RhythmHarpoonPage />
    </StrictMode>
  );
  expect(mountPracticeGame).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(dispose).toHaveBeenCalledTimes(2);
});
