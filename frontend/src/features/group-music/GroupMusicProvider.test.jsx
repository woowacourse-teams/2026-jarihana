import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "../auth/index.js";
import { advanceMusicPlayback, enqueueGroupMusic, fetchGroupMusic, saveMusicPlayback } from "./api.js";
import { loadYoutubeApi } from "./youtubeApi.js";
import { GroupMusicHeaderSlot, GroupMusicProvider, musicGroupId, useGroupMusic } from "./GroupMusicProvider.jsx";
let mockPath = "/groups/41";
jest.mock("react-router", () => ({ useLocation: () => ({ pathname: mockPath }) }));
jest.mock("../auth/index.js", () => ({ useAuth: jest.fn() }));
jest.mock("./api.js", () => ({ fetchGroupMusic: jest.fn(), enqueueGroupMusic: jest.fn(), saveMusicPlayback: jest.fn(), advanceMusicPlayback: jest.fn(), skipGroupMusic: jest.fn() }));
jest.mock("./youtubeApi.js", () => ({ loadYoutubeApi: jest.fn() }));
const music = { enabled: true, autoplay: true, title: "함께 듣는 오후", url: "https://youtube.com/playlist?list=PLabcdefghijk" };
const snapshot = (extra = {}) => ({ music, revision: 2, canEdit: true, updatedAt: "2026-11-09T14:00:00",
  serverTime: "2026-11-09T05:00:10Z", playback: { state: "PLAYING", playlistIndex: 0, positionSeconds: 5, anchorTime: "2026-11-09T05:00:00Z", revision: 3 }, ...extra });
let players;
let autoReady;
let streams;
const originalEventSource = global.EventSource;
const originalIntersectionObserver = global.IntersectionObserver;
function emitChange(index = 0) { streams[index].change(); }
function openStream(index = 0) { streams[index].onopen(); }
function Consumer() {
  const { openMusic, muted, toggleMuted } = useGroupMusic();
  return <><button onClick={openMusic}>스피커 열기</button><button onClick={toggleMuted} aria-pressed={muted}>아지트 음소거</button></>;
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><GroupMusicProvider><header aria-label="사이트 헤더"><GroupMusicHeaderSlot /></header><Consumer /></GroupMusicProvider></QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, refresh: () => view.rerender(tree()), refetch: () => client.refetchQueries({ queryKey: ["group-music"] }) };
}
beforeEach(() => {
  jest.clearAllMocks(); mockPath = "/groups/41"; players = []; autoReady = true; streams = [];
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback([{ intersectionRatio: 1 }]); }
    disconnect() {}
  };
  global.EventSource = class {
    constructor(url) { this.url = url; this.close = jest.fn(); streams.push(this); }
    addEventListener(name, listener) { if (name === "change") this.change = listener; }
  };
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 7 } });
  fetchGroupMusic.mockImplementation(async () => snapshot());
  saveMusicPlayback.mockImplementation(async (id, command) => snapshot({ playback: { ...snapshot().playback, ...command, revision: command.expectedRevision + 1 } }));
  advanceMusicPlayback.mockImplementation(async (id, command) => snapshot({ playback: { ...snapshot().playback, playlistIndex: 1, positionSeconds: 0, revision: command.expectedRevision + 1 } }));
  loadYoutubeApi.mockResolvedValue({ Player: jest.fn(function(target, options) {
    const frame = target instanceof HTMLIFrameElement ? target : document.createElement("iframe");
    frame.title = "실제 유튜브 플레이어";
    if (frame !== target) target.replaceWith(frame);
    const actual = { index: 0, time: 0, state: 2, duration: 120, volume: 60 };
    const instance = { actual, options, playVideo: jest.fn(() => { actual.state = 1; }), pauseVideo: jest.fn(() => { actual.state = 2; }), destroy: jest.fn(() => frame.remove()),
      setVolume: jest.fn((value) => { actual.volume = value; }), getPlaylist: () => ["abcdefghijk", "lmnopqrstuv"], getPlaylistIndex: () => actual.index,
      getCurrentTime: () => actual.time, getDuration: () => actual.duration, getPlayerState: () => actual.state,
      seekTo: jest.fn((value) => { actual.time = value; }), mute: jest.fn(), unMute: jest.fn(),
      loadPlaylist: jest.fn((value) => { actual.index = value.index; actual.time = value.startSeconds; actual.state = 1; }),
      cuePlaylist: jest.fn((value) => { actual.index = value.index; actual.time = value.startSeconds; actual.state = 5; }),
      cueVideoById: jest.fn((value) => { actual.time = value.startSeconds; actual.state = 5; }) };
    players.push(instance);
    if (autoReady) queueMicrotask(() => options.events.onReady({ target: instance }));
    return instance;
  }) });
});
afterEach(() => {
  global.EventSource = originalEventSource;
  global.IntersectionObserver = originalIntersectionObserver;
});
const loaded = async () => { await screen.findByTitle("실제 유튜브 플레이어"); await waitFor(() => expect(within(screen.getByRole("banner", { name: "사이트 헤더" })).getByRole("button", { name: /나만 잠시 멈춤|음소거/ })).toBeEnabled()); return players.at(-1); };
const tick = async (milliseconds) => { await act(async () => { jest.advanceTimersByTime(milliseconds); await Promise.resolve(); }); };
function openQueue() { fireEvent.click(within(screen.getByRole("banner", { name: "사이트 헤더" })).getByRole("button", { name: /대기열 열기/ })); }

test("context is optional outside a music provider", () => {
  render(<Consumer />); expect(() => fireEvent.click(screen.getByText("스피커 열기"))).not.toThrow();
});
test.each([["/groups/41", "41"], ["/groups/41/space", "41"], ["/groups/41/manage", null], ["/groups", null]])("matches only group listening routes %s", (path, id) => expect(musicGroupId(path)).toBe(id));
test("same group's detail and space reuse a single player; leaving group destroys it", async () => {
  const { refresh } = setup(); const player = await loaded();
  mockPath = "/groups/41/space"; refresh();
  expect(players).toHaveLength(1); expect(player.destroy).not.toHaveBeenCalled();
  mockPath = "/groups"; refresh();
  expect(player.pauseVideo).toHaveBeenCalled(); expect(player.destroy).toHaveBeenCalledTimes(1);
  expect(screen.queryByTitle("실제 유튜브 플레이어")).not.toBeInTheDocument();
});
test("entering another group replaces the player and group settings", async () => {
  const { refresh } = setup(); const first = await loaded();
  mockPath = "/groups/42"; refresh();
  await waitFor(() => expect(players).toHaveLength(2));
  expect(first.destroy).toHaveBeenCalledTimes(1); expect(fetchGroupMusic).toHaveBeenLastCalledWith("42");
  expect(streams[0].close).toHaveBeenCalledTimes(1);
});
test("a playlist-only link gives the YouTube API a playable iframe", async () => {
  setup(); await loaded();
  const url = new URL(screen.getByTitle("실제 유튜브 플레이어").src);
  expect(url.origin + url.pathname).toBe("https://www.youtube.com/embed/videoseries");
  expect(url.searchParams.get("list")).toBe("PLabcdefghijk");
  expect(url.searchParams.get("enablejsapi")).toBe("1");
  expect(url.searchParams.get("origin")).toBe(window.location.origin);
});
test("late join loads the server track at elapsed room time", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ playback: { ...snapshot().playback, playlistIndex: 1, positionSeconds: 20 } }));
  setup(); const player = await loaded();
  expect(player.loadPlaylist).toHaveBeenCalledWith(expect.objectContaining({ index: 1, startSeconds: expect.any(Number) }));
  expect(player.actual.time).toBeGreaterThanOrEqual(30); expect(player.actual.time).toBeLessThan(32);
});
test("two player instances converge from a shared server and follow a subsequent pause", async () => {
  let server = snapshot(); fetchGroupMusic.mockImplementation(async () => server);
  const first = setup(); const second = setup();
  await waitFor(() => expect(players).toHaveLength(2));
  await waitFor(() => expect(players.every((p) => p.loadPlaylist.mock.calls.length === 1)).toBe(true));
  expect(Math.abs(players[0].actual.time - players[1].actual.time)).toBeLessThan(2);
  server = snapshot({ playback: { ...server.playback, state: "PAUSED", positionSeconds: 45, revision: 4 } });
  await act(async () => { await first.refetch(); await second.refetch(); });
  expect(players.every((p) => p.actual.state === 2)).toBe(true);
  expect(players.every((p) => Math.abs(p.actual.time - 45) < 2)).toBe(true);
  expect(players).toHaveLength(2);
});
test("autoplay blocked requires a local listen action that first rejoins the room position", async () => {
  const view = setup(); const player = await loaded(); player.actual.state = 2;
  act(() => player.options.events.onAutoplayBlocked());
  expect(screen.getByRole("button", { name: "눌러서 함께 듣기" })).toBeEnabled();
  openQueue();
  expect(screen.getByRole("status")).toHaveTextContent("한 번 눌러");
  fetchGroupMusic.mockResolvedValue(snapshot({ serverTime: "2026-11-09T05:00:30Z" }));
  await act(async () => { await view.refetch(); });
  expect(player.playVideo).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("banner", { name: "사이트 헤더" })).getByRole("button", { name: "눌러서 함께 듣기" }));
  expect(player.actual.time).toBeGreaterThanOrEqual(35); expect(player.playVideo).toHaveBeenCalledTimes(1);
  expect(saveMusicPlayback).not.toHaveBeenCalled();
  act(() => player.options.events.onStateChange({ data: 1, target: player }));
  expect(screen.queryByText(/자동 재생이 차단/)).not.toBeInTheDocument();
});
test("the mini player opens and closes the queue without interrupting playback", async () => {
  const view = setup(); const first = await loaded();
  const frame = screen.getByTitle("실제 유튜브 플레이어");
  const header = within(screen.getByRole("banner", { name: "사이트 헤더" }));
  const title = header.getByRole("button", { name: "함께 듣는 오후 · 대기열 열기" });
  expect(screen.queryByRole("region", { name: "다음 곡" })).not.toBeInTheDocument();
  fireEvent.click(title);
  const panel = header.getByRole("complementary", { name: "우리 모임 음악" });
  expect(within(panel).getByRole("region", { name: "다음 곡" })).toBeVisible();
  const collapse = within(panel).getByRole("button", { name: "음악 패널 접기" });
  fireEvent.keyDown(collapse, { key: "Escape" });
  expect(title).toHaveFocus();
  expect(screen.queryByRole("region", { name: "다음 곡" })).not.toBeInTheDocument();
  expect(screen.getByTitle("실제 유튜브 플레이어")).toBe(frame);
  expect(first.destroy).not.toHaveBeenCalled();
  expect(first.pauseVideo).not.toHaveBeenCalled();
  expect(first.loadPlaylist).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "나만 잠시 멈춤" }));
  expect(first.pauseVideo).toHaveBeenCalledTimes(1);
  fetchGroupMusic.mockResolvedValue(snapshot({ serverTime: "2026-11-09T05:00:40Z" }));
  await act(async () => { await view.refetch(); });
  expect(first.playVideo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "함께 듣기" }));
  expect(first.actual.time).toBeGreaterThanOrEqual(45);
  expect(saveMusicPlayback).not.toHaveBeenCalled();
  expect(players).toHaveLength(1);
});
test("leaders send shared play/pause/track commands with playback CAS revision", async () => {
  setup(); await loaded(); openQueue();
  fireEvent.click(screen.getByRole("button", { name: "모두 일시 정지" }));
  await waitFor(() => expect(saveMusicPlayback).toHaveBeenCalledTimes(1));
  expect(saveMusicPlayback.mock.calls[0][1]).toMatchObject({ state: "PAUSED", playlistIndex: 0, expectedRevision: 3 });
  expect(saveMusicPlayback.mock.calls[0][1].positionSeconds).toBeGreaterThanOrEqual(15);
  await screen.findByRole("button", { name: "모두 재생" });
  fireEvent.click(screen.getByRole("button", { name: "모두 다음 영상" }));
  await waitFor(() => expect(saveMusicPlayback).toHaveBeenCalledTimes(2));
  expect(saveMusicPlayback.mock.calls[1][1]).toEqual({ state: "PLAYING", playlistIndex: 1, positionSeconds: 0, expectedRevision: 4 });
});
test("ordinary group members have local controls but cannot command the room", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, canAdd: true })); setup(); const p = await loaded(); openQueue();
  expect(screen.queryByRole("button", { name: "모두 일시 정지" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "모두 다음 영상" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "곡 추가" })).toBeEnabled();
  fireEvent.click(within(screen.getByRole("banner", { name: "사이트 헤더" })).getByRole("button", { name: "나만 잠시 멈춤" }));
  fireEvent.click(screen.getByRole("button", { name: "음소거" }));
  fireEvent.change(screen.getByRole("slider", { name: "음량" }), { target: { value: 35 } });
  expect(p.pauseVideo).toHaveBeenCalled(); expect(p.mute).toHaveBeenCalled(); expect(p.setVolume).toHaveBeenLastCalledWith(35);
  expect(saveMusicPlayback).not.toHaveBeenCalled();
});

test("a signed-in visitor can mute but cannot stop, advance or change the group's playback", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, canAdd: false }));
  setup(); const player = await loaded();
  const header = within(screen.getByRole("banner", { name: "사이트 헤더" }));
  fireEvent.click(header.getByRole("button", { name: "음소거" }));
  expect(player.mute).toHaveBeenCalledTimes(1);
  fireEvent.click(header.getByRole("button", { name: "소리 켜기" }));
  expect(player.unMute).toHaveBeenCalledTimes(1);
  openQueue();
  expect(header.getByRole("button", { name: "음소거" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "나만 잠시 멈춤" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "모두 일시 정지" })).not.toBeInTheDocument();
  expect(screen.queryByRole("slider", { name: "음량" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "곡 추가" })).not.toBeInTheDocument();
  expect(player.pauseVideo).not.toHaveBeenCalled();
  expect(saveMusicPlayback).not.toHaveBeenCalled();
});

test("the clubhouse and header mute the same player without changing shared playback", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, canAdd: false }));
  setup(); const player = await loaded();
  const hudMute = screen.getByRole("button", { name: "아지트 음소거" });
  const header = within(screen.getByRole("banner", { name: "사이트 헤더" }));
  fireEvent.click(hudMute);
  expect(player.mute).toHaveBeenCalledTimes(1);
  expect(hudMute).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(header.getByRole("button", { name: "소리 켜기" }));
  expect(player.unMute).toHaveBeenCalledTimes(1);
  expect(hudMute).toHaveAttribute("aria-pressed", "false");
  expect(saveMusicPlayback).not.toHaveBeenCalled();
});

test("a visitor can enable sound at the shared position after autoplay is blocked", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, canAdd: false }));
  setup(); const player = await loaded();
  player.actual.state = 2;
  act(() => player.options.events.onAutoplayBlocked());
  fireEvent.click(within(screen.getByRole("banner", { name: "사이트 헤더" })).getByRole("button", { name: "소리 켜기" }));
  expect(player.actual.time).toBeGreaterThanOrEqual(15);
  expect(player.playVideo).toHaveBeenCalledTimes(1);
  expect(saveMusicPlayback).not.toHaveBeenCalled();
});

test("an offscreen video waits to start and resumes from the shared position when it becomes visible", async () => {
  const originalObserver = global.IntersectionObserver;
  let notifyVisibility;
  global.IntersectionObserver = class {
    constructor(callback) { notifyVisibility = callback; }
    observe() {}
    disconnect() {}
  };
  try {
    const view = setup();
    const player = await loaded();
    expect(player.loadPlaylist).not.toHaveBeenCalled();
    act(() => notifyVisibility([{ intersectionRatio: 1 }]));
    expect(player.actual.state).toBe(1);
    act(() => notifyVisibility([{ intersectionRatio: 0 }]));
    expect(player.actual.state).toBe(2);
    fetchGroupMusic.mockResolvedValue(snapshot({ serverTime: "2026-11-09T05:00:30Z" }));
    await act(async () => { await view.refetch(); });
    act(() => notifyVisibility([{ intersectionRatio: 1 }]));
    expect(player.actual.state).toBe(1);
    expect(player.actual.time).toBeGreaterThanOrEqual(35);
    expect(saveMusicPlayback).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    global.IntersectionObserver = originalObserver;
  }
});

test("poll errors preserve the same mounted player and dirty settings", async () => {
  const view = setup(); await loaded(); openQueue(); const frame = screen.getByTitle("실제 유튜브 플레이어");
  fireEvent.click(screen.getByRole("button", { name: "곡 추가" }));
  fireEvent.change(screen.getByLabelText("곡 이름"), { target: { value: "미저장 설정 초안" } });
  fetchGroupMusic.mockRejectedValue({ status: 503 });
  await act(async () => { await view.refetch(); });
  expect(await screen.findByText(/실시간 연결을 복구/)).toBeInTheDocument();
  expect(screen.getByTitle("실제 유튜브 플레이어")).toBe(frame);
  expect(screen.getByLabelText("곡 이름")).toHaveValue("미저장 설정 초안");
});
test("stale poll response cannot overwrite a newer playback command", async () => {
  const view = setup(); await loaded(); openQueue();
  fireEvent.click(screen.getByRole("button", { name: "모두 일시 정지" }));
  await screen.findByRole("button", { name: "모두 재생" });
  await act(async () => { await view.refetch(); });
  expect(screen.getByRole("button", { name: "모두 재생" })).toBeInTheDocument();
});
test("an ordinary member can append without changing the current track, and sees a queued track consumed by an SSE update", async () => {
  const url = "https://www.youtube.com/watch?v=lmnopqrstuv";
  const track = { id: "queued-1", title: "새벽 음악", url };
  let server = snapshot({ canEdit: false, canAdd: true });
  fetchGroupMusic.mockImplementation(async () => server);
  enqueueGroupMusic.mockImplementation(async () => (server = {
    ...server, revision: 3, music: { ...server.music, queue: [track] }
  }));
  setup(); const currentPlayer = await loaded(); openQueue();
  expect(screen.queryByLabelText("유튜브 링크")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "곡 추가" }));
  fireEvent.change(screen.getByLabelText("유튜브 링크"), { target: { value: url } });
  fireEvent.change(screen.getByLabelText("곡 이름"), { target: { value: track.title } });
  fireEvent.click(screen.getByRole("button", { name: "대기열에 추가" }));
  const next = screen.getByRole("region", { name: "다음 곡" });
  expect(await within(next).findByText(track.title)).toBeInTheDocument();
  expect(enqueueGroupMusic).toHaveBeenCalledWith("41", { title: track.title, url });
  expect(currentPlayer.destroy).not.toHaveBeenCalled();
  server = { ...server, music: { ...music, title: track.title, url, currentQueueId: track.id, queue: [] }, revision: 4,
    playback: { ...server.playback, revision: 4 } };
  await act(async () => { openStream(); emitChange(); });
  expect(await within(screen.getByRole("region", { name: "현재 재생" })).findByText(track.title)).toBeInTheDocument();
  expect(within(next).queryByText(track.title)).not.toBeInTheDocument();
  expect(currentPlayer.destroy).toHaveBeenCalledTimes(1);
});

test("an unsuccessful member append keeps both fields for a retry", async () => {
  enqueueGroupMusic.mockRejectedValueOnce({ status: 503 });
  setup(); await loaded(); openQueue();
  fireEvent.click(screen.getByRole("button", { name: "곡 추가" }));
  fireEvent.change(screen.getByLabelText("유튜브 링크"), { target: { value: "https://youtu.be/abcdefghijk" } });
  fireEvent.change(screen.getByLabelText("곡 이름"), { target: { value: "다시 추가할 곡" } });
  fireEvent.click(screen.getByRole("button", { name: "대기열에 추가" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("곡을 추가하지 못했어요.");
  expect(screen.getByLabelText("곡 이름")).toHaveValue("다시 추가할 곡");
  expect(screen.getByLabelText("유튜브 링크")).toHaveValue("https://youtu.be/abcdefghijk");
});
test("visitor explicitly opening unset music sees an empty state with no settings", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, music: { ...music, enabled: false, url: "" } }));
  setup();
  const header = within(screen.getByRole("banner", { name: "사이트 헤더" }));
  const toggle = await header.findByRole("button", { name: "모임 음악" });
  expect(screen.queryByRole("complementary", { name: "우리 모임 음악" })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(header.getByText("재생 중인 곡이 없어요.")).toBeVisible();
  fireEvent.pointerDown(screen.getByText("스피커 열기"));
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByText("스피커 열기"));
  expect(header.getByRole("complementary", { name: "우리 모임 음악" })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(players).toHaveLength(0);
});
test("leaving before API readiness creates no orphan player", async () => {
  let resolve; loadYoutubeApi.mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = setup(); await waitFor(() => expect(loadYoutubeApi).toHaveBeenCalled());
  mockPath = "/groups"; view.refresh(); const Player = jest.fn(); await act(async () => resolve({ Player }));
  expect(Player).not.toHaveBeenCalled();
});
test("changing account destroys the previous player and refreshes permissions", async () => {
  const view = setup(); const old = await loaded();
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false })); useAuth.mockReturnValue({ status: "authenticated", member: { id: 19 } });
  view.refresh(); await waitFor(() => expect(players).toHaveLength(2));
  expect(old.destroy).toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "곡 추가" })).not.toBeInTheDocument();
});
test("member listener advances after YouTube duration without a leader present", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, canAdd: true })); setup(); const p = await loaded();
  p.actual.duration = 14; p.actual.state = 0;
  act(() => p.options.events.onStateChange({ data: 0, target: p }));
  await waitFor(() => expect(advanceMusicPlayback).toHaveBeenCalledTimes(1));
  expect(advanceMusicPlayback).toHaveBeenCalledWith("41", { expectedRevision: 3 });
});
test("unplayable video errors request server verification with bounded duplicate reports", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false, canAdd: true }));
  advanceMusicPlayback.mockRejectedValue({ status: 409 });
  setup(); const p = await loaded();
  act(() => {
    p.options.events.onError({ data: 150 });
    p.options.events.onError({ data: 150 });
  });
  await waitFor(() => expect(advanceMusicPlayback).toHaveBeenCalledTimes(1));
  expect(advanceMusicPlayback).toHaveBeenCalledWith("41", { expectedRevision: 3, checkUnavailable: true });
});
test.each([5, 153])("local playback error %s never skips the shared queue", async (code) => {
  setup(); const p = await loaded();
  act(() => p.options.events.onError({ data: code }));
  await act(async () => {});
  expect(advanceMusicPlayback).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("연결을 확인");
});
test("playlist-only enqueue stays in the draft and shows a video-link instruction", async () => {
  setup(); await loaded(); openQueue();
  fireEvent.click(screen.getByRole("button", { name: "곡 추가" }));
  fireEvent.change(screen.getByLabelText("곡 이름"), { target: { value: "재즈 목록" } });
  fireEvent.change(screen.getByLabelText("유튜브 링크"), { target: { value: music.url } });
  fireEvent.click(screen.getByRole("button", { name: "대기열에 추가" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("유튜브 영상 링크");
  expect(enqueueGroupMusic).not.toHaveBeenCalled();
  expect(screen.getByLabelText("곡 이름")).toHaveValue("재즈 목록");
});
test("advance CAS conflict refreshes the room instead of displaying an error loop", async () => {
  advanceMusicPlayback.mockRejectedValue({ status: 409 }); setup(); const p = await loaded();
  p.actual.duration = 14; act(() => p.options.events.onStateChange({ data: 0, target: p }));
  await waitFor(() => expect(fetchGroupMusic).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
test("anonymous listener never submits an advance command", async () => {
  useAuth.mockReturnValue({ status: "anonymous" }); fetchGroupMusic.mockResolvedValue(snapshot({ canEdit: false }));
  setup(); const p = await loaded(); p.actual.duration = 14;
  act(() => p.options.events.onStateChange({ data: 0, target: p })); await act(async () => {});
  expect(advanceMusicPlayback).not.toHaveBeenCalled();
});
test("a player iframe that never becomes ready has bounded recovery", async () => {
  jest.useFakeTimers(); autoReady = false;
  try {
    setup(); await act(async () => { await Promise.resolve(); }); await tick(1);
    await waitFor(() => expect(players).toHaveLength(1));
    await tick(20000);
    expect(screen.getByRole("alert")).toHaveTextContent("유튜브 영상에 연결하지 못했어요");
    expect(screen.getByRole("button", { name: "플레이어 다시 열기" })).toBeEnabled();
  } finally { jest.useRealTimers(); }
});
test("an open SSE connection replaces interval polling and refreshes on change without replacing the current player", async () => {
  jest.useFakeTimers();
  try {
    setup(); await tick(1); await waitFor(() => expect(players).toHaveLength(1));
    expect(streams[0].url).toBe("/api/groups/41/music/events");
    const first = players[0]; act(() => openStream());
    const initialFetches = fetchGroupMusic.mock.calls.length;
    await tick(16000);
    expect(fetchGroupMusic).toHaveBeenCalledTimes(initialFetches);
    await act(async () => emitChange());
    expect(fetchGroupMusic).toHaveBeenCalledTimes(initialFetches + 1);
    expect(players).toHaveLength(1); expect(first.destroy).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
test("paused room does not auto play even though local listening is enabled", async () => {
  fetchGroupMusic.mockResolvedValue(snapshot({ playback: { ...snapshot().playback, state: "PAUSED", positionSeconds: 25 } }));
  setup(); const p = await loaded(); expect(p.cuePlaylist).toHaveBeenCalledWith(expect.objectContaining({ startSeconds: 25 }));
  expect(p.loadPlaylist).not.toHaveBeenCalled(); expect(p.playVideo).not.toHaveBeenCalled();
});
test("player errors offer recovery without a false playing state", async () => {
  setup(); const p = await loaded(); act(() => p.options.events.onError({ data: 150 }));
  expect(screen.getByRole("alert")).toHaveTextContent("외부 재생이 허용되지 않은 영상");
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "플레이어 다시 열기" }));
  await waitFor(() => expect(players).toHaveLength(2)); expect(p.destroy).toHaveBeenCalled();
});

test("local volume, mute and pause persist after the queue advances to another video", async () => {
  const view = setup(); const first = await loaded(); openQueue();
  fireEvent.change(screen.getByRole("slider", { name: "음량" }), { target: { value: 25 } });
  fireEvent.click(screen.getByRole("button", { name: "음소거" }));
  fireEvent.click(screen.getByRole("button", { name: "음악 패널 접기" }));
  fireEvent.click(screen.getByRole("button", { name: "나만 잠시 멈춤" }));
  fetchGroupMusic.mockResolvedValue(snapshot({ revision: 3,
    music: { ...music, currentQueueId: "queued-2", title: "두 번째 곡", url: "https://youtu.be/lmnopqrstuv" } }));
  await act(async () => { await view.refetch(); });
  await waitFor(() => expect(players[1].setVolume).toHaveBeenCalledWith(25));
  expect(first.destroy).toHaveBeenCalledTimes(1);
  expect(players[1].mute).toHaveBeenCalledTimes(1);
  expect(players[1].playVideo).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "함께 듣기" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "두 번째 곡 · 대기열 열기" })).toBeVisible();
  expect(saveMusicPlayback).not.toHaveBeenCalled();
});

test("leader can pause the room before the local YouTube iframe becomes ready", async () => {
  autoReady = false; setup();
  fireEvent.click(await screen.findByRole("button", { name: /대기열 열기/ }));
  const pause = await screen.findByRole("button", { name: "모두 일시 정지" });
  expect(pause).toBeEnabled();
  expect(within(screen.getByRole("banner", { name: "사이트 헤더" })).getByRole("button", { name: "나만 잠시 멈춤" })).toBeDisabled();
  fireEvent.click(pause);
  await waitFor(() => expect(saveMusicPlayback).toHaveBeenCalledTimes(1));
  expect(saveMusicPlayback.mock.calls[0][1]).toMatchObject({ state: "PAUSED", expectedRevision: 3 });
  expect(await screen.findByRole("button", { name: "모두 재생" })).toBeEnabled();
});
