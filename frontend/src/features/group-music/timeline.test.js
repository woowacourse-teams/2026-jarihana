import { acceptMusicSnapshot, createTimelineFollower, playbackPosition, projectMusicSchedule, stampMusicSnapshot } from "./timeline.js";
const base = (extra = {}) => ({ revision: 1, music: { enabled: true }, serverTime: "2026-11-09T10:00:10Z", receivedAt: 1000,
  playback: { state: "PLAYING", playlistIndex: 0, positionSeconds: 5, anchorTime: "2026-11-09T10:00:00Z", revision: 2 }, ...extra });
function player({ index = 0, time = 0, state = 2, duration = 120 } = {}) {
  const current = { index, time, state, duration };
  return { current, getPlaylistIndex: () => current.index, getCurrentTime: () => current.time,
    getPlayerState: () => current.state, getDuration: () => current.duration, getPlaylist: () => ["a", "b", "c"],
    seekTo: jest.fn((value) => { current.time = value; }), playVideo: jest.fn(() => { current.state = 1; }), pauseVideo: jest.fn(() => { current.state = 2; }),
    loadPlaylist: jest.fn((options) => { current.index = options.index; current.time = options.startSeconds; current.state = 1; }),
    cuePlaylist: jest.fn((options) => { current.index = options.index; current.time = options.startSeconds; current.state = 5; }),
    cueVideoById: jest.fn((options) => { current.time = options.startSeconds; current.state = 5; }) };
}
const source = { videoId: null, playlistId: "PLabcdefghijk" };
function follower(target, snapshot, extra = {}) { return createTimelineFollower({ source, getPlayer: () => target,
  getSnapshot: () => snapshot, isListening: () => true, isBlocked: () => false, onAdvance: jest.fn(), now: () => 2000, ...extra }); }

test("position uses server elapsed plus monotonic receipt elapsed, not the client's wall clock", () => {
  const date = jest.spyOn(Date, "now").mockReturnValue(9999999999999);
  expect(playbackPosition(base(), 3000)).toBe(17);
  expect(playbackPosition(base({ playback: { ...base().playback, state: "PAUSED" } }), 900000)).toBe(5);
  expect(stampMusicSnapshot(base(), 123).receivedAt).toBe(123); date.mockRestore();
});
test("stale overlapping responses cannot roll back either revision or server-time observation", () => {
  const current = base();
  expect(acceptMusicSnapshot(current, base({ revision: 0 }))).toBe(current);
  expect(acceptMusicSnapshot(current, base({ playback: { ...current.playback, revision: 1 } }))).toBe(current);
  expect(acceptMusicSnapshot(current, base({ serverTime: "2026-11-09T10:00:09Z" }))).toBe(current);
  const newer = base({ playback: { ...current.playback, revision: 3 } });
  expect(acceptMusicSnapshot(current, newer)).toBe(newer);
});
test("two independent listeners converge on the same track and time, including a late join", () => {
  const first = player({ index: 2, time: 90 }); const second = player({ index: 1, time: 1 });
  follower(first, base())(); follower(second, base())();
  expect(first.current).toMatchObject({ index: 0, time: 16, state: 1 });
  expect(second.current).toMatchObject({ index: 0, time: 16, state: 1 });
  const late = player(); follower(late, base(), { now: () => 7000 })();
  expect(late.current.time).toBe(21);
});
test("a paused snapshot cues the same position without playing", () => {
  const p = player(); follower(p, base({ playback: { ...base().playback, state: "PAUSED", positionSeconds: 30 } }))();
  expect(p.cuePlaylist).toHaveBeenCalledWith(expect.objectContaining({ startSeconds: 30 }));
  expect(p.playVideo).not.toHaveBeenCalled(); expect(p.loadPlaylist).not.toHaveBeenCalled();
});
test("correction is thresholded and does not seek or replay on every poll", () => {
  let time = 2000; const p = player(); const snap = base();
  const sync = follower(p, snap, { now: () => time }); sync();
  p.current.time = 17; time = 3000; sync();
  expect(p.seekTo).not.toHaveBeenCalled(); expect(p.loadPlaylist).toHaveBeenCalledTimes(1);
  p.current.time = 4; time = 5000; sync();
  expect(p.seekTo).toHaveBeenCalledTimes(1); expect(p.current.time).toBe(19);
  sync(); expect(p.seekTo).toHaveBeenCalledTimes(1); expect(p.playVideo).not.toHaveBeenCalled();
});
test("blocked autoplay waits for explicit listen, then syncs to current room time", () => {
  const p = player(); let blocked = true;
  const sync = follower(p, base(), { isBlocked: () => blocked }); sync(); expect(p.loadPlaylist).not.toHaveBeenCalled();
  blocked = false; sync({ force: true }); expect(p.current.time).toBe(16);
});
test("a member can advance after actual duration and remembers old duration when YouTube auto-nexts", async () => {
  let time = 1000; const p = player({ duration: 20 }); const onAdvance = jest.fn().mockResolvedValue(undefined);
  const snap = base({ playback: { ...base().playback, positionSeconds: 0 } });
  const sync = follower(p, snap, { now: () => time, onAdvance }); sync();
  p.current.index = 1; p.current.duration = 99; time = 12000; sync();
  await Promise.resolve();
  expect(onAdvance).toHaveBeenCalledWith({ expectedRevision: 2 });
  expect(p.loadPlaylist).toHaveBeenCalledTimes(1);
});
test("advance overlap is bounded and rejected calls do not produce unhandled promises", async () => {
  const p = player({ duration: 12 }); const onAdvance = jest.fn().mockRejectedValue(new Error("409"));
  const sync = follower(p, base(), { onAdvance }); sync(); sync();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(onAdvance).toHaveBeenCalledTimes(1);
});
test("local listen off pauses only the local player and sends no advance", () => {
  const p = player({ state: 1, duration: 12 }); const onAdvance = jest.fn();
  follower(p, base(), { isListening: () => false, onAdvance })();
  expect(p.pauseVideo).toHaveBeenCalledTimes(1); expect(onAdvance).not.toHaveBeenCalled();
});
test("verified duration takes precedence over a stale iframe duration", async () => {
  const p = player({ duration: 1 }); const onAdvance = jest.fn();
  const snap = base({ music: { enabled: true, durationSeconds: 120 } });
  const sync = follower(p, snap, { onAdvance }); sync();
  await Promise.resolve();
  expect(onAdvance).not.toHaveBeenCalled();
  sync({ ended: true });
  await Promise.resolve();
  expect(onAdvance).toHaveBeenCalledWith({ expectedRevision: 2 });
});
test("ended notification can request verification before iframe duration is available", async () => {
  const p = player({ duration: 0 }); const onAdvance = jest.fn();
  follower(p, base(), { onAdvance })({ ended: true });
  await Promise.resolve();
  expect(onAdvance).toHaveBeenCalledWith({ expectedRevision: 2 });
});

test("schedule skips elapsed songs with no listener, retaining the position within the active song", () => {
  const next = { id: "b", title: "두 번째 곡", url: "https://youtu.be/lmnopqrstuv", durationSeconds: 8 };
  const last = { id: "c", title: "세 번째 곡", url: "https://youtu.be/abcdefghijk", durationSeconds: 10 };
  const original = base({ music: { enabled: true, currentQueueId: "a", durationSeconds: 20, queue: [next, last] } });
  expect(projectMusicSchedule(original, 4000)).toBe(original);
  const late = projectMusicSchedule(original, 17000);
  expect(late.music).toMatchObject({ currentQueueId: "c", title: last.title, queue: [] });
  expect(late.playback.revision).toBe(original.playback.revision);
  expect(playbackPosition(late, 17000)).toBe(3);
  const exhausted = projectMusicSchedule(original, 25000);
  expect(exhausted.music).toMatchObject({ enabled: false, currentQueueId: null, queue: [] });
  expect(exhausted.playback).toMatchObject({ state: "PAUSED", positionSeconds: 0 });
  expect(original.music.queue).toEqual([next, last]);
});

test("a paused schedule does not consume future songs", () => {
  const paused = base({ music: { enabled: true, currentQueueId: "a", durationSeconds: 20 },
    playback: { ...base().playback, state: "PAUSED" } });
  expect(projectMusicSchedule(paused, 250000)).toBe(paused);
});

test("an early iframe end waits for the scheduled boundary without sending an advance request", async () => {
  const p = player({ state: 0 });
  const onAdvance = jest.fn();
  const scheduled = base({ music: { enabled: true, currentQueueId: "a", durationSeconds: 20 } });
  const sync = follower(p, scheduled, { source: { videoId: "abcdefghijk", playlistId: null }, onAdvance });
  sync({ ended: true });
  sync();
  await Promise.resolve();
  expect(onAdvance).not.toHaveBeenCalled();
  expect(p.playVideo).not.toHaveBeenCalled();
});
