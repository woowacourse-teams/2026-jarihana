import { createGomokuAudio } from "./audio";

let context;
let source;
const originalFetch = global.fetch;
beforeEach(() => {
  source = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() };
  context = {
    state: "suspended", destination: {},
    decodeAudioData: jest.fn().mockResolvedValue({ duration: 1 }),
    createBufferSource: jest.fn(() => source),
    resume: jest.fn(async () => { context.state = "running"; }),
    close: jest.fn().mockResolvedValue()
  };
  window.AudioContext = jest.fn(() => context);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
});
afterEach(() => { delete window.AudioContext; global.fetch = originalFetch; });
const loaded = () => new Promise((resolve) => setTimeout(resolve, 0));

test("preloads, unlocks on gesture, plays without amplification and cleans up", async () => {
  const audio = createGomokuAudio({ start: "/start.wav" });
  await loaded();
  audio.play("start");
  expect(source.start).not.toHaveBeenCalled();
  document.dispatchEvent(new Event("pointerdown"));
  await loaded();
  expect(source.start).not.toHaveBeenCalled();
  audio.play("start");
  expect(source.buffer).toEqual({ duration: 1 });
  expect(source.start).toHaveBeenCalledTimes(1);
  audio.dispose();
  expect(source.stop).toHaveBeenCalledTimes(1);
  expect(context.close).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  context.resume.mockClear();
  context.state = "suspended";
  document.dispatchEvent(new Event("keydown"));
  expect(context.resume).not.toHaveBeenCalled();
  audio.play("start");
  expect(source.start).toHaveBeenCalledTimes(1);
});

test("failed loading or blocked resume does not throw or queue a stale cue", async () => {
  fetch.mockRejectedValue(new Error("offline"));
  context.resume.mockRejectedValue(new Error("blocked"));
  const audio = createGomokuAudio({ start: "/start.wav" });
  document.dispatchEvent(new Event("keydown"));
  await loaded();
  expect(() => audio.play("start")).not.toThrow();
  expect(source.start).not.toHaveBeenCalled();
  audio.dispose();
});

test("unavailable Web Audio is a silent no-op", () => {
  delete window.AudioContext;
  const audio = createGomokuAudio({ start: "/start.wav" });
  expect(() => { audio.play("start"); audio.dispose(); }).not.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
