import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  RhythmBattleLobbyPage,
  RhythmBattleRoomPage
} from "../../../src/pages/games/RhythmBattlePages.jsx";
import { rhythmBattleApi } from "../../../src/features/game/rhythm/battle/battleApi";

const mockNavigate = jest.fn();
const mockBoard = jest.fn();
let mockParams = {};
jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => mockParams
}));
let mockMember = { id: 7 };
jest.mock("../../../src/features/auth", () => ({
  useAuth: () => ({ status: "authenticated", member: mockMember })
}));
jest.mock("../../../src/features/game/rhythm/battle/battleApi", () => {
  const actual = jest.requireActual("../../../src/features/game/rhythm/battle/battleApi");
  return {
    ...actual,
    rhythmBattleApi: {
      lobby: jest.fn(),
      mine: jest.fn(),
      summary: jest.fn(),
      ranking: jest.fn(),
      room: jest.fn(),
      chat: jest.fn(),
      create: jest.fn(),
      join: jest.fn(),
      ready: jest.fn(),
      start: jest.fn(),
      leave: jest.fn(),
      invite: jest.fn(),
      send: jest.fn()
    }
  };
});
// 판 런타임(Canvas, Web Audio, 시작 시각 맞추기)은 따로 검증한다. 여기서는 판이 받는 값만 본다.
jest.mock("../../../src/features/game/rhythm/battle/RhythmBattleBoard.jsx", () => ({
  RhythmBattleBoard: (properties) => {
    mockBoard(properties);
    return <div data-testid="battle-board">board {properties.room.gameNumber}</div>;
  }
}));

const player = (memberId, name, ready = false) => ({
  memberId,
  name,
  avatarUrl: null,
  ready,
  scrollSpeed: 1.5
});
const run = (memberId, overrides = {}) => ({
  memberId,
  status: "PLAYING",
  outReason: null,
  outAt: null,
  playedUntil: 10,
  lastSequence: 20,
  scrollSpeed: 1.5,
  score: 12000,
  combo: 5,
  bestCombo: 30,
  lives: 4,
  loopReached: 1,
  perfect: 40,
  hit: 3,
  enough: 0,
  uhoh: 0,
  poor: 1,
  miss: 2,
  ...overrides
});
const room = (overrides = {}) => ({
  id: 5,
  revision: 3,
  serverNow: Date.now(),
  status: "WAITING",
  visibility: "PUBLIC",
  level: "HARD",
  chartVersion: "bars-13-16-1",
  gameNumber: 0,
  seed: 0,
  startsAt: null,
  host: player(7, "요크"),
  guest: player(8, "파도"),
  winnerMemberId: null,
  endReason: null,
  runs: [],
  ...overrides
});

let stream;
function emit(kind, data) {
  act(() => stream.listeners[kind]({ data: JSON.stringify(data) }));
}

function renderWithQuery(element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockParams = {};
  mockMember = { id: 7 };
  global.EventSource = class {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      stream = this;
    }
    addEventListener(kind, listener) {
      this.listeners[kind] = listener;
    }
    close() {
      this.closed = true;
    }
  };
  rhythmBattleApi.mine.mockResolvedValue({ roomId: null });
  rhythmBattleApi.lobby.mockResolvedValue({
    items: [{ id: 11, hostName: "이삭", hostAvatarUrl: null, level: "HARDEST", createdAt: "2026-11-16T10:00:00" }],
    nextCursor: null,
    hasNext: false
  });
  rhythmBattleApi.summary.mockResolvedValue({ wins: 3, losses: 1, draws: 0, total: 4 });
  rhythmBattleApi.ranking.mockResolvedValue({
    items: [
      { rank: 1, memberId: 8, name: "파도", avatarUrl: null, wins: 5, losses: 0, draws: 0, total: 5 },
      { rank: 2, memberId: 7, name: "요크", avatarUrl: null, wins: 3, losses: 1, draws: 0, total: 4 }
    ],
    me: { rank: 2, memberId: 7, name: "요크", avatarUrl: null, wins: 3, losses: 1, draws: 0, total: 4 },
    nextCursor: null,
    hasNext: false
  });
  rhythmBattleApi.chat.mockResolvedValue({ items: [] });
});

describe("lobby", () => {
  it("creates a room with the chosen visibility and level, joins public rooms and shows the win ranking", async () => {
    rhythmBattleApi.create.mockResolvedValue({ roomId: 21 });
    rhythmBattleApi.join.mockResolvedValue({ roomId: 11 });
    renderWithQuery(<RhythmBattleLobbyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "온라인 매칭" })).toBeInTheDocument();
    const rooms = screen.getByRole("region", { name: "기다리는 방" });
    expect(await within(rooms).findByText("이삭")).toBeInTheDocument();
    expect(within(rooms).getByText("Hardest")).toBeInTheDocument();
    const ranking = await screen.findByRole("list", { name: "승수 랭킹" });
    expect(within(ranking).getAllByRole("listitem")[1]).toHaveClass("is-mine");
    const record = screen.getByRole("region", { name: "내 전적과 랭킹" });
    expect(record.querySelector(".rhythm-battle-record__mine")).toHaveTextContent("3승 1패 0무");

    fireEvent.click(screen.getByRole("radio", { name: /초대 전용/ }));
    fireEvent.change(screen.getByLabelText("난이도"), { target: { value: "hard" } });
    const create = screen.getByRole("button", { name: "방 만들기" });
    expect(create).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_battle_create");
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/games/rhythm-harpoon/battle/rooms/21"));
    expect(rhythmBattleApi.create).toHaveBeenCalledWith({ visibility: "PRIVATE", level: "hard" });

    fireEvent.click(within(rooms).getByRole("button", { name: "참가" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/games/rhythm-harpoon/battle/rooms/11"));
    expect(rhythmBattleApi.join).toHaveBeenCalledWith(11);
  });

  it("points a member who already sits in a room back to it instead of creating or joining another", async () => {
    rhythmBattleApi.mine.mockResolvedValue({ roomId: 9 });
    renderWithQuery(<RhythmBattleLobbyPage />);
    const back = await screen.findByRole("link", { name: "내 방으로" });
    expect(back).toHaveAttribute("href", "/games/rhythm-harpoon/battle/rooms/9");
    expect(back).toHaveAttribute("data-ph-capture-attribute-action", "rhythm_battle_my_room_open");
    // 방 화면의 "대기실" 링크로 왔을 수 있으므로 바로 방으로 돌려보내지 않는다.
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "방 만들기" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "참가" })).toBeDisabled();
  });

  it("explains a conflict when the room cannot be joined", async () => {
    rhythmBattleApi.join.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
    renderWithQuery(<RhythmBattleLobbyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "참가" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 참여한 방이 있거나 들어갈 수 없는 방이에요.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("room", () => {
  beforeEach(() => {
    mockParams = { roomId: "5" };
  });

  it("lets both players ready up with their own speed and only the host start", async () => {
    rhythmBattleApi.room.mockResolvedValue(room({ guest: player(8, "파도", true) }));
    rhythmBattleApi.ready.mockResolvedValue({ roomId: 5 });
    renderWithQuery(<RhythmBattleRoomPage />);

    const seats = await screen.findByRole("region", { name: "참가자" });
    expect(within(seats).getByText("요크")).toBeInTheDocument();
    expect(within(seats).getByText("준비 완료")).toBeInTheDocument();
    expect(stream.url).toBe("/api/games/rhythm-battle/rooms/5/events");
    const start = screen.getByRole("button", { name: "시작" });
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByLabelText("내 세균 이동 배속"), { target: { value: "2" } });
    rhythmBattleApi.room.mockResolvedValue(room({ revision: 4, host: player(7, "요크", true), guest: player(8, "파도", true) }));
    fireEvent.click(screen.getByRole("button", { name: "준비" }));
    await waitFor(() =>
      expect(rhythmBattleApi.ready).toHaveBeenCalledWith(5, { ready: true, gameNumber: 1, scrollSpeed: 2 })
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "시작" })).toBeEnabled());
    expect(screen.getByLabelText("내 세균 이동 배속")).toBeDisabled();
  });

  it("tells the guest that the host starts the game", async () => {
    mockMember = { id: 8 };
    rhythmBattleApi.room.mockResolvedValue(room());
    renderWithQuery(<RhythmBattleRoomPage />);
    expect(await screen.findByText("두 사람이 준비하면 방장이 시작해요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "시작" })).not.toBeInTheDocument();
  });

  it("keeps the boards through the result and shows who won", async () => {
    rhythmBattleApi.room.mockResolvedValue(room());
    renderWithQuery(<RhythmBattleRoomPage />);
    await screen.findByRole("region", { name: "참가자" });

    const playing = room({
      revision: 10,
      status: "PLAYING",
      gameNumber: 1,
      seed: 4242,
      startsAt: Date.now() + 5000,
      runs: [run(7), run(8)]
    });
    emit("snapshot", playing);
    expect(screen.getByTestId("battle-board")).toHaveTextContent("board 1");
    expect(screen.getByText("대전 중 / Esc는 기권")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "참가자" })).not.toBeInTheDocument();

    // 오래된 모습은 무시하고, 상대 입력 묶음은 같은 판의 것만 쌓는다.
    emit("snapshot", room({ revision: 9 }));
    expect(screen.getByTestId("battle-board")).toBeInTheDocument();
    const batch = { id: 1, memberId: 8, sequence: 1, playedUntil: 0.5, inputs: [[0, 0.3]] };
    emit("batches", { gameNumber: 1, items: [batch] });
    emit("batches", { gameNumber: 1, items: [batch, { ...batch, id: 2, sequence: 2, playedUntil: 1 }] });
    expect(mockBoard.mock.lastCall[0].batches.items.map((item) => item.id)).toEqual([1, 2]);

    emit(
      "snapshot",
      room({
        ...playing,
        revision: 12,
        status: "FINISHED",
        winnerMemberId: 7,
        endReason: "ELIMINATED",
        runs: [run(7, { score: 54000 }), run(8, { status: "OUT", outReason: "ELIMINATED", outAt: 31.2, lives: 0 })]
      })
    );
    expect(screen.getByTestId("battle-board")).toHaveTextContent("board 1");
    const result = screen.getByRole("region", { name: "승리!" });
    expect(result).toHaveClass("is-win");
    expect(result).toHaveTextContent("상대가 먼저 라이프를 모두 잃었어요.");
    expect(within(result).getByRole("row", { name: /요크/ })).toHaveClass("is-winner");
    expect(within(result).getByText("54,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "준비" })).toBeInTheDocument();
  });

  it("shows a forfeit loss from the loser's side", async () => {
    mockMember = { id: 8 };
    rhythmBattleApi.room.mockResolvedValue(
      room({
        status: "FINISHED",
        gameNumber: 1,
        winnerMemberId: 7,
        endReason: "FORFEIT",
        runs: [run(7), run(8, { status: "OUT", outReason: "ABANDONED" })]
      })
    );
    renderWithQuery(<RhythmBattleRoomPage />);
    const result = await screen.findByRole("region", { name: "패배" });
    expect(result).toHaveTextContent("기권으로 졌어요.");
    // 판이 끝난 뒤 들어오면 지난 판 화면은 다시 띄우지 않는다.
    expect(screen.queryByTestId("battle-board")).not.toBeInTheDocument();
  });

  it("shares chat messages without duplicating the one just sent", async () => {
    rhythmBattleApi.room.mockResolvedValue(room());
    const message = {
      id: 3,
      memberId: 7,
      senderName: "요크",
      body: "한 판 해요",
      clientMessageId: "c-1",
      createdAt: "2026-11-16T10:00:00"
    };
    rhythmBattleApi.send.mockResolvedValue(message);
    renderWithQuery(<RhythmBattleRoomPage />);
    const chat = await screen.findByRole("region", { name: "방 채팅" });
    expect(within(chat).getByText("아직 대화가 없어요.")).toBeInTheDocument();

    fireEvent.change(within(chat).getByLabelText("채팅 입력"), { target: { value: " 한 판 해요 " } });
    fireEvent.click(within(chat).getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(within(chat).getByText("한 판 해요")).toBeInTheDocument());
    expect(rhythmBattleApi.send).toHaveBeenCalledWith(5, expect.any(String), "한 판 해요");
    emit("chat", { items: [message, { ...message, id: 4, memberId: 8, senderName: "파도", body: "좋아요" }] });
    expect(within(chat).getAllByRole("listitem")).toHaveLength(2);
    expect(within(chat).getByText("한 판 해요").closest("li")).toHaveClass("is-mine");
  });
});
