import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { GamesPage } from "../../../src/pages/games/index.jsx";
import { RhythmHarpoonPage } from "../../../src/pages/games/RhythmHarpoonPage.jsx";
import { RhythmHarpoonEntryPage } from "../../../src/pages/games/RhythmHarpoonEntryPage.jsx";
import { RhythmHarpoonSinglePage } from "../../../src/pages/games/RhythmHarpoonSinglePage.jsx";
import { RhythmHarpoonLessonPage } from "../../../src/pages/games/RhythmHarpoonLessonPage.jsx";
import { mountPracticeGame } from "../../../src/features/game/rhythm/mount-practice-game.mjs";
import { mountLessonGame } from "../../../src/features/game/rhythm/mount-lesson-game.mjs";
import { playLessonPreview } from "../../../src/features/game/rhythm/lesson-audio.mjs";

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
jest.mock("../../../src/features/game/rhythm/mount-lesson-game.mjs", () => ({
  mountLessonGame: jest.fn()
}));
jest.mock("../../../src/features/game/rhythm/lesson-audio.mjs", () => ({
  playLessonPreview: jest.fn(() => 1)
}));

beforeEach(() => {
  mountPracticeGame.mockReset();
  mountLessonGame.mockReset();
  playLessonPreview.mockClear();
  localStorage.clear();
  window.AudioContext = jest.fn(() => ({ state: "running", close: jest.fn(() => Promise.resolve()) }));
});

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

it("starts from two panels and only opens single play until online matching exists", () => {
  render(<RhythmHarpoonEntryPage />);
  const back = screen.getByRole("link", { name: "게임방" });
  expect(back).toHaveAttribute("href", "/games");
  expect(back).toHaveAttribute("data-ph-capture-attribute-action", "games_back");
  const single = screen.getByRole("link", { name: /싱글 플레이/ });
  expect(single).toHaveAttribute("href", "/games/rhythm-harpoon/single");
  expect(single).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_single_open");
  const online = screen.getByRole("button", { name: /온라인 매칭/ });
  expect(online).toBeDisabled();
  expect(online).toHaveTextContent("준비 중");
  expect(online).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_online_open");
});

it("shows the sound tutorial open until it is finished, then folds it away", () => {
  const first = render(<RhythmHarpoonSinglePage />);
  expect(document.querySelector("details")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "따라 하기 시작 (1분)" })).toHaveAttribute(
    "href",
    "/games/rhythm-harpoon/learn"
  );
  expect(screen.getAllByRole("img", { name: /패턴 악보/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: /^쿵 빨강/ }));
  expect(playLessonPreview).toHaveBeenCalledWith(expect.anything(), 0);
  expect(screen.getByRole("link", { name: /혼자 연습/ })).toHaveAttribute(
    "href",
    "/games/rhythm-harpoon/practice"
  );
  expect(screen.getByRole("button", { name: /공식 도전/ })).toBeDisabled();
  first.unmount();

  localStorage.setItem("haengseong-lesson-v1", JSON.stringify({ done: [true, true, true] }));
  render(<RhythmHarpoonSinglePage />);
  const fold = document.querySelector("details");
  expect(fold).not.toHaveAttribute("open");
  expect(fold.querySelector("summary")).toHaveTextContent("조작법을 다시 보고 싶다면?");
  expect(fold.querySelector("summary")).toHaveTextContent("펼치기 ▼");
  expect(fold.querySelector("summary")).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "rhythm_tutorial_toggle"
  );
  expect(screen.getByRole("link", { name: "따라 하기 다시 하기" })).toBeInTheDocument();
});

it("runs the lesson with a slower default tempo and records passed steps", () => {
  const player = { play: jest.fn(), stop: jest.fn(), dispose: jest.fn() };
  mountLessonGame.mockReturnValue(player);
  const view = render(<RhythmHarpoonLessonPage />);
  const settings = mountLessonGame.mock.calls[0][0];
  expect(screen.getByRole("button", { name: "보통 96" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "×1.0" })).toHaveAttribute("aria-pressed", "true");
  act(() => settings.onReady());
  fireEvent.click(screen.getByRole("button", { name: "느리게 72" }));
  expect(player.stop).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "×1.5" }));
  fireEvent.click(screen.getByRole("button", { name: "해보기" }));
  expect(player.play).toHaveBeenLastCalledWith({ stepIndex: 0, bpm: 72, scrollSpeed: 1.5, auto: false });
  act(() =>
    settings.onFinish({ stepIndex: 0, auto: false, total: 16, caught: 15, missed: 1, poor: 0, passed: true })
  );
  expect(screen.getByText(/16개 중 15개를 잡았어요/)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("haengseong-lesson-v1")).done).toEqual([true, false, false]);
  fireEvent.click(screen.getByRole("button", { name: "다음 소리: 착" }));
  expect(screen.getByRole("heading", { name: "착 = 파랑, 쿵과 쿵 사이" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "건너뛰기" }));
  expect(JSON.parse(localStorage.getItem("haengseong-lesson-v1")).skipped).toBe(true);
  view.unmount();
  expect(player.dispose).toHaveBeenCalledTimes(1);
});

it("returns from practice to single play", () => {
  render(<RhythmHarpoonPage />);
  const back = screen.getByRole("link", { name: "싱글 플레이" });
  expect(back).toHaveAttribute("href", "/games/rhythm-harpoon/single");
  expect(back).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_single_back");
  expect(screen.getByLabelText("세균 위 소리 글자 표시")).toBeChecked();
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
