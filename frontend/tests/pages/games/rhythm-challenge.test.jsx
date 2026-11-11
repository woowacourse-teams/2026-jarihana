import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { RhythmHarpoonChallengePage } from "../../../src/pages/games/RhythmHarpoonChallengePage.jsx";
import { rhythmRankedApi } from "../../../src/features/game/rhythm/rankedApi.js";
import { useRhythmRanking } from "../../../src/features/game/rhythm/useRhythmRanking.js";

const mockNavigate = jest.fn();
const mockBoard = jest.fn();
jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate
}));
jest.mock("../../../src/features/auth", () => ({
  useAuth: () => ({ status: "authenticated", member: { id: 7 } })
}));
jest.mock("../../../src/features/game/rhythm/rankedApi.js", () => ({
  rhythmRankedApi: { create: jest.fn(), abandon: jest.fn(() => Promise.resolve()) }
}));
jest.mock("../../../src/features/game/rhythm/useRhythmRanking.js", () => ({
  useRhythmRanking: jest.fn()
}));
// 판 런타임(Canvas, Web Audio)은 따로 검증한다. 여기서는 판이 알리는 결과만 흉내 낸다.
jest.mock("../../../src/features/game/rhythm/RhythmRankedBoard.jsx", () => ({
  RhythmRankedBoard: (properties) => {
    mockBoard(properties);
    return (
      <div data-testid="ranked-board">
        <button onClick={() => properties.onFinished(mockFinished)} type="button">
          finish
        </button>
        <button onClick={() => properties.onInvalid("LAGGED")} type="button">
          lag
        </button>
      </div>
    );
  }
}));

const mockFinished = {
  challengeId: 31,
  status: "FINISHED",
  score: 123400,
  bestCombo: 87,
  loopReached: 2,
  perfect: 140,
  hit: 20,
  enough: 3,
  uhoh: 1,
  poor: 4,
  miss: 9
};
const created = {
  challengeId: 31,
  level: "HARDEST",
  scrollSpeed: 2,
  seed: 987654,
  rulesVersion: "rhythm-harpoon-ranked-4",
  chartVersion: "bars-13-16-1",
  status: "CREATED"
};
const rankingRow = (memberId, rank, name, score) => ({
  memberId,
  challengeId: memberId * 10,
  rank,
  name,
  avatarUrl: null,
  score,
  bestCombo: 50,
  loopReached: 2,
  achievedAt: "2026-11-07T12:00:00"
});

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockClear();
  mockBoard.mockClear();
  rhythmRankedApi.create.mockReset();
  rhythmRankedApi.abandon.mockClear();
  useRhythmRanking.mockReturnValue({
    isPending: false,
    isError: false,
    hasNextPage: false,
    data: {
      pages: [
        {
          items: [rankingRow(3, 1, "가을", 200000), rankingRow(7, 2, "겨울", 123400)],
          me: rankingRow(7, 2, "겨울", 123400),
          nextCursor: null,
          hasNext: false
        }
      ]
    }
  });
});

async function reachBoard() {
  rhythmRankedApi.create.mockResolvedValue(created);
  render(<RhythmHarpoonChallengePage />);
  fireEvent.click(screen.getByRole("button", { name: /^Hardest/ }));
  fireEvent.click(screen.getByRole("button", { name: "설정 바꾸기" }));
  fireEvent.change(screen.getByLabelText("세균 이동 배속"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "도전 시작" }));
  await screen.findByTestId("ranked-board");
}

it("walks from options to a confirmed challenge with the server seed", async () => {
  localStorage.setItem("haengseong-offset-ms", "-12");
  await reachBoard();
  expect(rhythmRankedApi.create).toHaveBeenCalledWith({ level: "hardest", scrollSpeed: 2 });
  expect(mockBoard.mock.calls.at(-1)[0].session).toEqual({
    challengeId: 31,
    seed: 987654,
    level: "hardest",
    scrollSpeed: 2,
    chartVersion: "bars-13-16-1",
    rulesVersion: "rhythm-harpoon-ranked-4"
  });
  expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("도전");
});

it("offers ANOTHER Hardest as an official level and starts from the last practice choice", async () => {
  localStorage.setItem(
    "haengseong-practice-settings-v1",
    JSON.stringify({ level: "anotherHardest", rate: 1, volume: 65 })
  );
  rhythmRankedApi.create.mockResolvedValue({
    ...created,
    level: "ANOTHER_HARDEST",
    chartVersion: "swing-another-2"
  });
  render(<RhythmHarpoonChallengePage />);
  expect(screen.getByRole("button", { name: /ANOTHER Hardest/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /^ANOTHER Hard(?!est)/ })).toHaveAttribute("aria-pressed", "false");
  expect(useRhythmRanking).toHaveBeenLastCalledWith("anotherHardest");
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "도전 시작" }));
  await screen.findByTestId("ranked-board");
  expect(rhythmRankedApi.create).toHaveBeenCalledWith({ level: "anotherHardest", scrollSpeed: 1 });
  expect(mockBoard.mock.calls.at(-1)[0].session).toMatchObject({
    level: "anotherHardest",
    chartVersion: "swing-another-2"
  });
});

it("opens the detailed settings in a side drawer, keeps a summary and closes it with Esc without leaving", () => {
  render(<RhythmHarpoonChallengePage />);
  const toggle = screen.getByRole("button", { name: "설정 바꾸기" });
  const drawer = screen.getByRole("complementary", { name: "랭킹 도전 설정" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveAttribute("aria-controls", drawer.id);
  expect(toggle).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_challenge_settings_toggle");
  expect(drawer).not.toHaveClass("is-open");
  expect(drawer).toHaveAttribute("inert");
  const summary = screen.getByRole("list", { name: "지금 설정" });
  expect(within(summary).getByText("배속 ×1.0")).toBeInTheDocument();
  expect(within(summary).getByText("키 A S W D")).toBeInTheDocument();

  fireEvent.click(toggle);
  expect(drawer).toHaveClass("is-open");
  expect(drawer).not.toHaveAttribute("inert");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "설정 닫기" })).toHaveFocus();
  fireEvent.change(screen.getByLabelText("세균 이동 배속"), { target: { value: "1.5" } });
  expect(within(summary).getByText("배속 ×1.5")).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(drawer).not.toHaveClass("is-open");
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(toggle).toHaveFocus();
});

it("sets the input offset on the options step, saves it and plays with it", async () => {
  localStorage.setItem("haengseong-input-offset-v1", "12");
  rhythmRankedApi.create.mockResolvedValue(created);
  render(<RhythmHarpoonChallengePage />);
  fireEvent.click(screen.getByRole("button", { name: "설정 바꾸기" }));
  const slider = screen.getByRole("slider", { name: /입력 지연 보정/ });
  expect(slider).toHaveValue("12");
  fireEvent.change(slider, { target: { value: "-24" } });
  expect(screen.getByText("-24ms")).toBeInTheDocument();
  expect(slider).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_challenge_offset_change");
  expect(screen.getByRole("button", { name: "싱크 진단 / 보정" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("-24ms")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "도전 시작" }));
  await screen.findByTestId("ranked-board");
  expect(mockBoard.mock.calls.at(-1)[0].settings.offset).toBe(-24);
  expect(localStorage.getItem("haengseong-input-offset-v1")).toBe("-24");
});

it("changes volume, display and direction keys on the options step, saves them and plays with them", async () => {
  localStorage.setItem(
    "haengseong-practice-settings-v1",
    JSON.stringify({ level: "medium", rate: 1.5, volume: 65, timingFeedback: true, labels: true })
  );
  rhythmRankedApi.create.mockResolvedValue(created);
  render(<RhythmHarpoonChallengePage />);
  fireEvent.click(screen.getByRole("button", { name: "설정 바꾸기" }));
  const volume = screen.getByRole("slider", { name: /음량/ });
  expect(volume).toHaveValue("65");
  expect(volume).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_challenge_volume_change");
  fireEvent.change(volume, { target: { value: "40" } });
  const labels = screen.getByRole("checkbox", { name: "세균 위 소리 글자 표시" });
  expect(labels).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_challenge_labels_toggle");
  fireEvent.click(labels);
  const timing = screen.getByRole("checkbox", { name: "FAST/SLOW 표시" });
  expect(timing).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_challenge_timing_feedback_toggle");
  fireEvent.click(timing);

  // 랭킹 도전은 처음부터 다시 할 수 없어 다시 하기 키는 보여 주지 않는다.
  expect(screen.queryByRole("button", { name: /다시 하기 키 바꾸기/ })).not.toBeInTheDocument();
  const left = screen.getByRole("button", { name: "왼쪽 키 바꾸기, 지금 A" });
  fireEvent.click(left);
  fireEvent.keyDown(left, { code: "KeyJ", key: "j" });
  expect(screen.getByRole("button", { name: "왼쪽 키 바꾸기, 지금 J" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("haengseong-keymap-v1"))).toMatchObject({
    left: "KeyJ",
    retry: "KeyR"
  });
  expect(JSON.parse(localStorage.getItem("haengseong-practice-settings-v1"))).toEqual({
    level: "medium",
    rate: 1.5,
    volume: 40,
    timingFeedback: false,
    labels: false
  });

  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("방향키 또는 J S W D")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "도전 시작" }));
  await screen.findByTestId("ranked-board");
  expect(mockBoard.mock.calls.at(-1)[0].settings).toMatchObject({
    volume: 40,
    labels: false,
    timingFeedback: false,
    keymap: expect.objectContaining({ left: "KeyJ" })
  });
});

it("summarizes the options and the no-pause rules before starting", () => {
  render(<RhythmHarpoonChallengePage />);
  const levels = screen.getByRole("group", { name: "난이도" });
  for (const button of within(levels).getAllByRole("button", { pressed: false })) {
    expect(button).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_challenge_level_select");
  }
  fireEvent.click(screen.getByRole("button", { name: /Medium/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  const summary = screen.getByRole("heading", { name: "이 설정으로 도전할까요?" }).parentElement;
  expect(within(summary).getByText("Medium / 라이프 8")).toBeInTheDocument();
  expect(within(summary).getByText(/시작하면 멈출 수 없어요/)).toBeInTheDocument();
  expect(within(summary).getByText(/기록 없이 무효예요/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "도전 시작" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "rhythm_challenge_start"
  );
  fireEvent.click(screen.getByRole("button", { name: "옵션 바꾸기" }));
  expect(screen.getByRole("heading", { name: "옵션 설정" })).toBeInTheDocument();
});

it("shows the chosen level ranking next to the options and follows a new level choice", () => {
  render(<RhythmHarpoonChallengePage />);
  const options = screen.getByRole("region", { name: "옵션 설정" });
  expect(screen.getByRole("region", { name: "Easy 랭킹" }).parentElement).toBe(options.parentElement);
  expect(useRhythmRanking).toHaveBeenLastCalledWith("easy");
  fireEvent.click(screen.getByRole("button", { name: /Medium/ }));
  const ranking = screen.getByRole("region", { name: "Medium 랭킹" });
  expect(ranking.parentElement).toBe(options.parentElement);
  expect(screen.queryByRole("region", { name: "Easy 랭킹" })).not.toBeInTheDocument();
  expect(useRhythmRanking).toHaveBeenLastCalledWith("medium");
  expect(within(ranking).getByText("2위")).toBeInTheDocument();
});

it("shows the server result next to the level ranking with the player marked", async () => {
  await reachBoard();
  fireEvent.click(screen.getByRole("button", { name: "finish" }));
  const result = screen.getByRole("region", { name: "Hardest 도전 결과" });
  const ranking = screen.getByRole("region", { name: "Hardest 랭킹" });
  expect(result.parentElement).toBe(ranking.parentElement);
  expect(within(result).getByText("123,400")).toBeInTheDocument();
  expect(within(result).getByRole("row", { name: /MAX COMBO/ })).toHaveTextContent("87");
  expect(useRhythmRanking).toHaveBeenCalledWith("hardest");
  const rows = within(ranking).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveClass("is-gold");
  expect(rows[1]).toHaveClass("is-silver", "is-mine");
  expect(rows[1]).toHaveTextContent("나");
  expect(within(ranking).getByText("2위")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 도전" }));
  expect(screen.getByRole("heading", { name: "이 설정으로 도전할까요?" })).toBeInTheDocument();
});

it("explains why a run was not recorded", async () => {
  await reachBoard();
  fireEvent.click(screen.getByRole("button", { name: "lag" }));
  expect(screen.getByRole("heading", { name: "이번 도전은 무효예요" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("진행이 멈췄다가 이어져서");
});

it("shows a create failure and stays on the confirmation step", async () => {
  rhythmRankedApi.create.mockRejectedValue(new Error("offline"));
  render(<RhythmHarpoonChallengePage />);
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "도전 시작" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "이 설정으로 도전할까요?" })).toBeInTheDocument();
});

it("goes back one step with Esc and drops a challenge that has not started", async () => {
  await reachBoard();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(rhythmRankedApi.abandon).toHaveBeenCalledWith(31);
  expect(screen.getByRole("heading", { name: "이 설정으로 도전할까요?" })).toBeInTheDocument();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(screen.getByRole("heading", { name: "옵션 설정" })).toBeInTheDocument();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(mockNavigate).toHaveBeenCalledWith("/games/rhythm-harpoon");
});
