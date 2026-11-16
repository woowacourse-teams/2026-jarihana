/** @jest-environment node */
import { apiRequest, createApiClient } from "../../shared/api/index.js";
import { advanceMusicPlayback, enqueueGroupMusic, fetchGroupMusic, saveGroupMusic, saveMusicPlayback } from "./api.js";
import { parseYoutubeUrl } from "./youtubeUrl.js";
jest.mock("../../shared/api/index.js", () => ({ ...jest.requireActual("../../shared/api/index.js"), apiRequest: jest.fn() }));
const music = { enabled: true, autoplay: true, title: "우리 모임의 음악", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
const snapshot = { music, revision: 2, canEdit: true, updatedAt: "2026-11-09T14:00:00",
  serverTime: "2026-11-09T05:00:10Z", playback: { state: "PLAYING", playlistIndex: 0, positionSeconds: 5, anchorTime: "2026-11-09T05:00:00Z", revision: 3 } };
const reply = (data, status = 200, code) => new Response(JSON.stringify({ success: !code, data: code ? null : data, error: code ? { code, message: "detail" } : null }), { status, headers: { "content-type": "application/json" } });
let wire;
beforeEach(() => {
  wire = jest.fn(async () => reply(snapshot));
  const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire, cookieSource: () => "XSRF-TOKEN=music-token" });
  apiRequest.mockImplementation((url, options) => client.request(url, options));
});
test.each([
  ["https://youtu.be/dQw4w9WgXcQ?si=shared", "dQw4w9WgXcQ", null],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijk", "dQw4w9WgXcQ", "PLabcdefghijk"],
  ["https://music.youtube.com/playlist?list=PLabcdefghijk", null, "PLabcdefghijk"],
  ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", null],
  ["https://youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", null]
])("accepts documented YouTube link %s", (url, videoId, playlistId) => expect(parseYoutubeUrl(url)).toEqual({ videoId, playlistId }));
test.each(["https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://user@youtube.com/watch?v=dQw4w9WgXcQ", "http://youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com:443/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "https://youtube.com/playlist?list=bad", "javascript:alert(1)", "https://youtu.be/dQw4w9WgXcQ/extra", "https://youtube.com/watch?v=dQw4w9WgXcQ&list=bad"])("rejects unsafe or invalid URL %s", (url) => expect(parseYoutubeUrl(url)).toBeNull());
test("GET uses actual group route and validates response", async () => {
  expect(await fetchGroupMusic(41)).toMatchObject({ ...snapshot, receivedAt: expect.any(Number) });
  expect(wire.mock.calls[0][0].url).toBe("https://app.test/api/groups/41/music");
});
test("PUT sends settings and revision with cookie CSRF transport", async () => {
  let body;
  wire.mockImplementation(async (request) => { body = await request.clone().json(); return reply(snapshot); });
  await saveGroupMusic(41, { music, expectedRevision: 1 });
  expect(body).toEqual({ music, expectedRevision: 1 });
  expect(wire.mock.calls[0][0].method).toBe("PUT");
  expect(wire.mock.calls[0][0].headers.get("X-XSRF-TOKEN")).toBe("music-token");
  expect(wire.mock.calls[0][0].credentials).toBe("include");
});
test("invalid enabled URL fails before network; disabled empty config is allowed", async () => {
  expect(() => saveGroupMusic(41, { music: { ...music, url: "" }, expectedRevision: 0 })).toThrow("유튜브");
  expect(wire).not.toHaveBeenCalled();
  await saveGroupMusic(41, { music: { ...music, enabled: false, url: "" }, expectedRevision: 0 });
  expect(wire).toHaveBeenCalledTimes(1);
});
test("save conflict retains server code and never retries automatically", async () => {
  wire.mockImplementation(async () => reply(null, 409, "GROUP_MUSIC_CONFLICT"));
  await expect(saveGroupMusic(41, { music, expectedRevision: 1 })).rejects.toMatchObject({ status: 409, code: "GROUP_MUSIC_CONFLICT" });
  expect(wire).toHaveBeenCalledTimes(1);
});


test("shared playback commands and member advance use independent CAS endpoints", async () => {
  const bodies = [];
  wire.mockImplementation(async (request) => { bodies.push({ method: request.method, url: request.url, body: await request.clone().json() }); return reply(snapshot); });
  const command = { expectedRevision: 3, state: "PAUSED", playlistIndex: 1, positionSeconds: 25 };
  const advance = { expectedRevision: 3 };
  await saveMusicPlayback(41, command); await advanceMusicPlayback(41, advance);
  expect(bodies).toEqual([
    { method: "PUT", url: "https://app.test/api/groups/41/music/playback", body: command },
    { method: "POST", url: "https://app.test/api/groups/41/music/playback/advance", body: advance }
  ]);
});

test("queue accepts only one video and removes the external playlist parameter", async () => {
  expect(() => enqueueGroupMusic(41, { title: "목록", url: "https://youtube.com/playlist?list=PLabcdefghijk" })).toThrow("영상 링크");
  expect(wire).not.toHaveBeenCalled();
  let body;
  wire.mockImplementation(async (request) => { body = await request.clone().json(); return reply(snapshot); });
  await enqueueGroupMusic(41, { title: "노래", url: `${music.url}&list=PLabcdefghijk` });
  expect(body).toEqual({ title: "노래", url: music.url });
});

test("server verified duration and skip notice survive snapshot validation", async () => {
  const queued = { id: "second", title: "다음 곡", url: music.url, durationSeconds: 88, verifiedAt: "2026-11-11T00:00:00Z" };
  wire.mockImplementation(async () => reply({ ...snapshot, music: {
    ...music, durationSeconds: 205, verifiedAt: "2026-11-11T00:00:00Z", lastSkippedTitle: "삭제된 곡", queue: [queued]
  } }));
  expect((await fetchGroupMusic(41)).music).toMatchObject({ durationSeconds: 205, lastSkippedTitle: "삭제된 곡", queue: [queued] });
});
test("invalid shared timestamp or negative playback position cannot enter synchronization", async () => {
  wire.mockImplementationOnce(async () => reply({ ...snapshot, serverTime: "2026-11-09T05:00:10" }));
  await expect(fetchGroupMusic(41)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  wire.mockImplementationOnce(async () => reply({ ...snapshot, playback: { ...snapshot.playback, positionSeconds: -1 } }));
  await expect(fetchGroupMusic(41)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
