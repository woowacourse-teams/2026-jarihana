import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { GamesPage } from "../../../src/pages/games/index.jsx";
import { RhythmHarpoonPage } from "../../../src/pages/games/RhythmHarpoonPage.jsx";
import { RhythmHarpoonEntryPage } from "../../../src/pages/games/RhythmHarpoonEntryPage.jsx";
import { RhythmHarpoonSinglePage } from "../../../src/pages/games/RhythmHarpoonSinglePage.jsx";
import { RhythmHarpoonLessonPage } from "../../../src/pages/games/RhythmHarpoonLessonPage.jsx";
import { mountPracticeGame } from "../../../src/features/game/rhythm/mount-practice-game.mjs";
import { mountLessonGame } from "../../../src/features/game/rhythm/mount-lesson-game.mjs";
import { mountDemoBoard } from "../../../src/features/game/rhythm/mount-demo-board.mjs";
import { storeReturnTarget } from "../../../src/features/auth";

const mockNavigate = jest.fn();
const mockLogin = jest.fn();
jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => ({})
}));
jest.mock("../../../src/features/auth", () => ({
  storeReturnTarget: jest.fn(),
  useAuth: () => ({ status: "anonymous", login: mockLogin })
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
// 첫 화면 카드의 실제 판 재생(Canvas, 채보 요청)은 여기서 돌리지 않는다.
jest.mock("../../../src/features/game/rhythm/mount-demo-board.mjs", () => ({
  mountDemoBoard: jest.fn(() => () => {})
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockLogin.mockClear();
  storeReturnTarget.mockClear();
  mountPracticeGame.mockReset();
  mountLessonGame.mockReset();
  localStorage.clear();
  // 처음 화면의 튜토리얼 권유 창은 따로 시험하고, 다른 시험에서는 이미 물어본 것으로 둔다.
  document.cookie = "rhythm_tutorial_offered=1; Path=/";
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

it("starts from the official challenge card while practice is closed and plays real boards on both cards", () => {
  render(<RhythmHarpoonEntryPage />);
  const back = screen.getByRole("link", { name: "게임방" });
  expect(back).toHaveAttribute("href", "/games");
  expect(back).toHaveAttribute("data-ph-capture-attribute-action", "games_back");
  expect(screen.getByRole("heading", { level: 1, name: "행성이의 리듬 작살" })).toBeInTheDocument();
  expect(screen.queryByText("싱글 플레이")).not.toBeInTheDocument();
  const [singleCard, onlineCard] = screen.getAllByRole("article");
  expect(singleCard).toHaveClass("games-card", "games-card--playable");
  expect(singleCard).toHaveAccessibleName("랭킹 도전");
  expect(screen.queryByText("공식 도전")).not.toBeInTheDocument();
  // 카드 그림 자리에서 실제 판이 소리 없이 자동으로 돈다. 온라인 매칭 카드는 내 판과 상대 판 두 개다.
  expect(mountDemoBoard).toHaveBeenCalledTimes(2);
  expect(singleCard.querySelectorAll("canvas.rhythm-demo__board")).toHaveLength(1);
  expect(onlineCard.querySelectorAll("canvas.rhythm-demo__board")).toHaveLength(2);
  const [singleDemo, onlineDemo] = mountDemoBoard.mock.calls.map(([options]) => options);
  expect(singleCard).toContainElement(singleDemo.canvas);
  expect(singleDemo.rivalCanvas).toBeNull();
  expect(onlineCard).toContainElement(onlineDemo.canvas);
  expect(onlineCard).toContainElement(onlineDemo.rivalCanvas);
  const single = screen.getByRole("link", { name: "랭킹 도전 시작" });
  expect(singleCard).toContainElement(single);
  expect(single).toHaveAttribute("href", "/games/rhythm-harpoon/challenge");
  expect(single).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_ranked_open");
  expect(singleCard).toHaveTextContent("로그인이 필요해요");
  fireEvent.click(single);
  expect(mockLogin).toHaveBeenCalledTimes(1);
  expect(storeReturnTarget).toHaveBeenCalledWith("/games/rhythm-harpoon/challenge");
  expect(onlineCard).toHaveClass("games-card", "games-card--soon");
  expect(onlineCard).toHaveAccessibleName("온라인 매칭, 준비 중");
  const online = screen.getByRole("button", { name: "준비 중" });
  expect(onlineCard).toContainElement(online);
  expect(online).toBeDisabled();
  expect(online).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_online_open");
});

describe("tutorial prompt for first-time visitors", () => {
  beforeEach(() => {
    document.cookie = "rhythm_tutorial_offered=; Path=/; Max-Age=0";
    // 권유 쿠키는 리듬 작살 경로에만 남으므로 그 경로에서 읽는다.
    window.history.pushState({}, "", "/games/rhythm-harpoon");
  });
  afterEach(() => {
    document.cookie = "rhythm_tutorial_offered=; Path=/games/rhythm-harpoon; Max-Age=0";
    window.history.pushState({}, "", "/");
  });

  it("asks once, closes with Esc without leaving and remembers the answer in a cookie", () => {
    const first = render(<RhythmHarpoonEntryPage />);
    const dialog = screen.getByRole("dialog", { name: "튜토리얼 보시겠어요?" });
    const accept = within(dialog).getByRole("link", { name: "튜토리얼 보기" });
    expect(accept).toHaveAttribute("href", "/games/rhythm-harpoon/learn");
    expect(accept).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_tutorial_prompt_accept");
    expect(within(dialog).getByRole("button", { name: "괜찮아요" })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "rhythm_tutorial_prompt_dismiss"
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(document.cookie).toContain("rhythm_tutorial_offered=1");
    first.unmount();

    render(<RhythmHarpoonEntryPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("remembers a visitor who declines or opens the tutorial", () => {
    const declined = render(<RhythmHarpoonEntryPage />);
    fireEvent.click(screen.getByRole("button", { name: "괜찮아요" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.cookie).toContain("rhythm_tutorial_offered=1");
    declined.unmount();

    document.cookie = "rhythm_tutorial_offered=; Path=/games/rhythm-harpoon; Max-Age=0";
    render(<RhythmHarpoonEntryPage />);
    fireEvent.click(screen.getByRole("link", { name: "튜토리얼 보기" }));
    expect(document.cookie).toContain("rhythm_tutorial_offered=1");
  });

  it("does not ask visitors who already finished or skipped the tutorial", () => {
    localStorage.setItem("haengseong-lesson-v1", JSON.stringify({ done: [], skipped: true }));
    render(<RhythmHarpoonEntryPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

it("offers the tutorial below the play mode cards", () => {
  render(<RhythmHarpoonEntryPage />);
  const lesson = screen.getByRole("link", { name: /TUTORIAL/ });
  expect(lesson).toHaveClass("rhythm-entry-lesson");
  expect(lesson).toHaveAttribute("href", "/games/rhythm-harpoon/learn");
  expect(lesson).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_lesson_open");
  expect(lesson).not.toHaveTextContent("따라 하기");
  expect(lesson).not.toHaveTextContent("처음이라면");
  const art = lesson.querySelector(".rhythm-mode__art");
  expect(art).toHaveAttribute("aria-hidden", "true");
  expect(art.querySelector("svg")).toBeInTheDocument();
  const [, onlineCard] = screen.getAllByRole("article");
  expect(onlineCard.nextElementSibling).toBe(lesson);
});

it("keeps practice and challenge on the single play screen for when practice reopens, without the lesson", () => {
  render(<RhythmHarpoonSinglePage />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /따라 하기/ })).not.toBeInTheDocument();
  const practice = screen.getByRole("link", { name: /혼자 연습/ });
  expect(practice).toHaveAttribute("href", "/games/rhythm-harpoon/practice");
  const challenge = screen.getByRole("link", { name: /공식 도전/ });
  expect(challenge).toHaveAttribute("href", "/games/rhythm-harpoon/challenge");
  expect(challenge).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_ranked_open");
  expect(Array.from(practice.parentElement.children)).toEqual([practice, challenge]);
  for (const card of [practice, challenge]) {
    const art = card.querySelector(".rhythm-mode__art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art.querySelector("svg")).toBeInTheDocument();
  }
  fireEvent.click(challenge);
  expect(mockLogin).toHaveBeenCalledTimes(1);
  expect(storeReturnTarget).toHaveBeenCalledWith("/games/rhythm-harpoon/challenge");
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
  const drawer = screen.getByRole("complementary", { name: "따라 하기 설명과 설정" });
  expect(drawer).toHaveClass("is-open");
  fireEvent.click(screen.getByRole("button", { name: "해보기" }));
  expect(player.play).toHaveBeenLastCalledWith({ stepIndex: 0, bpm: 72, scrollSpeed: 1.5, auto: false });
  expect(drawer).not.toHaveClass("is-open");
  act(() =>
    settings.onFinish({ stepIndex: 0, auto: false, total: 16, caught: 15, missed: 1, poor: 0, passed: true })
  );
  expect(screen.getByText(/16개 중 15개를 잡았어요/)).toBeInTheDocument();
  expect(drawer).toHaveClass("is-open");
  expect(JSON.parse(localStorage.getItem("haengseong-lesson-v1")).done).toEqual([true, false, false, false]);
  fireEvent.click(screen.getByRole("button", { name: "다음 소리: 착" }));
  expect(screen.getByRole("heading", { name: "착 = 파랑, 쿵과 쿵 사이" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "건너뛰기" }));
  expect(JSON.parse(localStorage.getItem("haengseong-lesson-v1")).skipped).toBe(true);
  view.unmount();
  expect(player.dispose).toHaveBeenCalledTimes(1);
});

it("offers the extra 따 step after the three core sounds without counting it toward completion", () => {
  localStorage.setItem("haengseong-lesson-v1", JSON.stringify({ done: [true, true, false], skipped: false }));
  const player = { play: jest.fn(), stop: jest.fn(), dispose: jest.fn() };
  mountLessonGame.mockReturnValue(player);
  render(<RhythmHarpoonLessonPage />);
  const settings = mountLessonGame.mock.calls[0][0];
  act(() => settings.onReady());
  fireEvent.click(screen.getByRole("button", { name: /3\. 치/ }));
  act(() =>
    settings.onFinish({ stepIndex: 2, auto: false, total: 32, caught: 30, missed: 2, poor: 0, passed: true })
  );
  expect(screen.getByText(/세 소리를 다 익혔어요/)).toBeInTheDocument();
  const finish = screen.getByRole("link", { name: "공식 도전으로" });
  expect(finish).toHaveAttribute("href", "/games/rhythm-harpoon/challenge");
  fireEvent.click(screen.getByRole("button", { name: "번외: 따 익히기" }));
  expect(screen.getByRole("heading", { name: "따 = 초록, 스윙 엇박" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "스윙 144" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "원곡 128" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "스윙 144" }));
  fireEvent.click(screen.getByRole("button", { name: "해보기" }));
  expect(player.play).toHaveBeenLastCalledWith({ stepIndex: 3, bpm: 144, scrollSpeed: 1, auto: false });
  act(() =>
    settings.onFinish({ stepIndex: 3, auto: false, total: 32, caught: 32, missed: 0, poor: 0, passed: true })
  );
  expect(screen.getByText(/ANOTHER에서 초록 세균을 만나 봐요/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "번외: 따 익히기" })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("haengseong-lesson-v1")).done).toEqual([true, true, true, true]);
});

it("sets the shared input offset in the lesson drawer and applies it to the next attempt", () => {
  localStorage.setItem("haengseong-input-offset-v1", "-12");
  const player = { play: jest.fn(), stop: jest.fn(), dispose: jest.fn(), setOffset: jest.fn() };
  mountLessonGame.mockReturnValue(player);
  const { container } = render(<RhythmHarpoonLessonPage />);
  const slider = container.querySelector("#lesson-offset");
  expect(slider).toHaveValue("-12");
  expect(slider).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_lesson_offset_change");
  expect(screen.getByRole("button", { name: "싱크 진단 / 보정" })).toBeInTheDocument();
  fireEvent.change(slider, { target: { value: "20" } });
  expect(player.setOffset).toHaveBeenLastCalledWith(20);
  expect(localStorage.getItem("haengseong-input-offset-v1")).toBe("20");
  expect(screen.getByText(/연습과 공식 도전에도 같은 값이 쓰여요/)).toBeInTheDocument();
});

it("keeps difficulty above the board and hides the other practice settings while playing", () => {
  render(<RhythmHarpoonPage />);
  const settings = mountPracticeGame.mock.calls[0][0];
  const drawer = screen.getByRole("complementary", { name: "연습 설정" });
  const toggle = screen.getByRole("button", { name: "설정" });
  expect(drawer).not.toContainElement(screen.getByRole("group", { name: "난이도" }));  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(toggle).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_settings_toggle");
  expect(drawer).toHaveClass("is-open");
  act(() => settings.onPlayingChange(true));
  expect(drawer).not.toHaveClass("is-open");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.pointerDown(toggle);
  act(() => settings.onPlayingChange(false));
  fireEvent.click(toggle);
  expect(drawer).toHaveClass("is-open");
  fireEvent.click(toggle);
  expect(drawer).not.toHaveClass("is-open");
});

it("keeps the practice settings closed when the run ends", () => {
  render(<RhythmHarpoonPage />);
  const settings = mountPracticeGame.mock.calls[0][0];
  const drawer = screen.getByRole("complementary", { name: "연습 설정" });
  const toggle = screen.getByRole("button", { name: "설정" });
  act(() => settings.onPlayingChange(true));
  act(() => settings.onPlayingChange(false, "over"));
  expect(drawer).not.toHaveClass("is-open");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  act(() => settings.onPlayingChange(true));
  act(() => settings.onPlayingChange(false));
  expect(drawer).toHaveClass("is-open");
});

it("rebinds practice keys, swaps conflicts and keeps the layout for the next visit", () => {
  const first = render(<RhythmHarpoonPage />);
  const settings = mountPracticeGame.mock.calls[0][0];
  const left = screen.getByRole("button", { name: "왼쪽 키 바꾸기, 지금 A" });
  expect(left).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_key_bind_left");
  fireEvent.click(left);
  expect(left).toHaveTextContent("키를 누르세요");
  expect(settings.keyBindings.capturing()).toBe(true);
  fireEvent.keyDown(left, { code: "Space", key: " " });
  expect(screen.getByText("글자, 숫자, 기호 키만 쓸 수 있어요. 다른 키를 눌러 주세요.")).toBeInTheDocument();
  fireEvent.keyDown(left, { code: "KeyJ", key: "j" });
  expect(settings.keyBindings.capturing()).toBe(false);
  expect(settings.keyBindings.get().left).toBe("KeyJ");
  expect(screen.getByText("왼쪽을 J 키로 바꿨어요.")).toBeInTheDocument();
  const retry = screen.getByRole("button", { name: "다시 하기 키 바꾸기, 지금 R" });
  fireEvent.click(retry);
  fireEvent.keyDown(retry, { code: "KeyW", key: "w" });
  expect(settings.keyBindings.get()).toMatchObject({ retry: "KeyW", up: "KeyR" });
  expect(screen.getByText("W 키를 다시 하기에 두고, 위는 R 키로 바꿨어요.")).toBeInTheDocument();
  expect(screen.getByText("J 왼쪽 / S 아래 / R 위 / D 오른쪽 / W 다시 하기")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "같은 설정으로 다시 (W)" })).toBeInTheDocument();
  first.unmount();

  render(<RhythmHarpoonPage />);
  expect(screen.getByRole("button", { name: "왼쪽 키 바꾸기, 지금 J" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "기본 키로 되돌리기" }));
  expect(screen.getByRole("button", { name: "왼쪽 키 바꾸기, 지금 A" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("haengseong-keymap-v1"))).toMatchObject({ left: "KeyA", retry: "KeyR" });
});

it("remembers the lesson tempo and scroll speed", () => {
  localStorage.setItem("haengseong-lesson-settings-v1", JSON.stringify({ bpm: 72, scrollSpeed: 2 }));
  mountLessonGame.mockReturnValue({ play: jest.fn(), stop: jest.fn(), dispose: jest.fn() });
  render(<RhythmHarpoonLessonPage />);
  expect(screen.getByRole("button", { name: "느리게 72" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "×2.0" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "원곡 128" }));
  expect(JSON.parse(localStorage.getItem("haengseong-lesson-settings-v1"))).toEqual({
    bpm: 128,
    scrollSpeed: 2
  });
});

it("returns from practice to single play", () => {
  render(<RhythmHarpoonPage />);
  const back = screen.getByRole("link", { name: "싱글 플레이" });
  expect(back).toHaveAttribute("href", "/games/rhythm-harpoon/single");
  expect(back).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_single_back");
  expect(screen.getByLabelText("세균 위 소리 글자 표시")).toBeChecked();
});

it.each([
  ["entry", RhythmHarpoonEntryPage, "/games"],
  ["single play", RhythmHarpoonSinglePage, "/games/rhythm-harpoon"],
  ["lesson", RhythmHarpoonLessonPage, "/games/rhythm-harpoon"],
  ["practice", RhythmHarpoonPage, "/games/rhythm-harpoon/single"]
])("goes back one step from the %s screen with Esc", (_name, Page, previous) => {
  mountLessonGame.mockReturnValue({ play: jest.fn(), dispose: jest.fn() });
  const view = render(<Page />);
  expect(document.querySelector("[aria-keyshortcuts='Escape']")).toHaveAttribute("href", previous);
  fireEvent.keyDown(document.body, { key: "Escape", repeat: true });
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith(previous);
  view.unmount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

it("leaves Esc to the game, open dialogs and text fields before going back", () => {
  render(<RhythmHarpoonEntryPage />);
  const pauseFirst = (event) => event.preventDefault();
  window.addEventListener("keydown", pauseFirst, { capture: true });
  fireEvent.keyDown(document.body, { key: "Escape" });
  window.removeEventListener("keydown", pauseFirst, { capture: true });

  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  fireEvent.keyDown(document.body, { key: "Escape" });
  dialog.remove();

  const field = document.createElement("input");
  document.body.append(field);
  fireEvent.keyDown(field, { key: "Escape" });
  field.remove();

  fireEvent.keyDown(document.body, { key: "Enter" });
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(mockNavigate).toHaveBeenCalledWith("/games");
});

it("renders a React-owned game and excludes prototype shortcuts from the service", () => {
  render(<RhythmHarpoonPage />);
  expect(screen.getByRole("application")).toBeInTheDocument();
  expect(document.querySelector("iframe")).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("연습 플레이");
  expect(screen.getByText("연습 점수", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Easy 라이프 10" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(screen.queryByLabelText("오토 감상")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("시작 구간")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("시작 루프")).not.toBeInTheDocument();
  const settings = mountPracticeGame.mock.calls[0][0];
  expect(Object.keys(settings).sort()).toEqual([
    "keyBindings",
    "onError",
    "onPlayingChange",
    "onReady",
    "root"
  ]);
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
