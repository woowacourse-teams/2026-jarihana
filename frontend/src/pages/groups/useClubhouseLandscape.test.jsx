import { renderHook } from "@testing-library/react";
import { useClubhouseLandscape } from "./useClubhouseLandscape.js";

let orientation;
let fullscreenElement;
let requestFullscreen;
let exitFullscreen;
const restore = [];

function replace(target, name, descriptor) {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  restore.push(() => {
    if (original) Object.defineProperty(target, name, original);
    else delete target[name];
  });
}

beforeEach(() => {
  fullscreenElement = null;
  orientation = { lock: jest.fn().mockResolvedValue(undefined), unlock: jest.fn() };
  requestFullscreen = jest.fn(async () => { fullscreenElement = document.documentElement; });
  exitFullscreen = jest.fn(async () => { fullscreenElement = null; });
  replace(window, "matchMedia", { value: (query) => ({
    matches: query.includes("pointer: coarse"),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }) });
  replace(window.screen, "orientation", { value: orientation });
  replace(document, "fullscreenEnabled", { value: true });
  replace(document, "fullscreenElement", { get: () => fullscreenElement });
  replace(document.documentElement, "requestFullscreen", { value: requestFullscreen });
  replace(document, "exitFullscreen", { value: exitFullscreen });
});

afterEach(() => {
  while (restore.length) restore.pop()();
});

test("requests fullscreen from the visit gesture, locks landscape, and releases both on exit", async () => {
  const { result } = renderHook(useClubhouseLandscape);
  const pending = result.current.lockLandscape();
  expect(requestFullscreen).toHaveBeenCalledTimes(1);
  expect(orientation.lock).not.toHaveBeenCalled();
  await pending;
  expect(orientation.lock).toHaveBeenCalledWith("landscape");

  result.current.releaseLandscape();
  expect(orientation.unlock).toHaveBeenCalledTimes(1);
  expect(exitFullscreen).toHaveBeenCalledTimes(1);
});

test("leaves fullscreen when landscape lock is rejected", async () => {
  orientation.lock.mockRejectedValueOnce(new Error("Not supported"));
  const { result } = renderHook(useClubhouseLandscape);
  await result.current.lockLandscape();
  expect(exitFullscreen).toHaveBeenCalledTimes(1);
  expect(orientation.unlock).not.toHaveBeenCalled();
});

test("still exits fullscreen when the browser rejects unlock", async () => {
  const { result } = renderHook(useClubhouseLandscape);
  await result.current.lockLandscape();
  orientation.unlock.mockImplementationOnce(() => { throw new DOMException("Document is hidden", "SecurityError"); });
  result.current.releaseLandscape();
  expect(exitFullscreen).toHaveBeenCalledTimes(1);
});

test("releases a native lock that completes after leaving the page", async () => {
  let finishLock;
  orientation.lock.mockImplementationOnce(() => new Promise((resolve) => { finishLock = resolve; }));
  const { result, unmount } = renderHook(useClubhouseLandscape);
  const pending = result.current.lockLandscape();
  await Promise.resolve();
  await Promise.resolve();
  expect(orientation.lock).toHaveBeenCalledWith("landscape");

  unmount();
  finishLock();
  await pending;
  expect(orientation.unlock).toHaveBeenCalledTimes(1);
  expect(exitFullscreen).toHaveBeenCalledTimes(1);
});
