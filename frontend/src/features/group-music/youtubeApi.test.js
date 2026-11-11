beforeEach(() => {
  jest.resetModules(); jest.useFakeTimers();
  delete window.YT; delete window.onYouTubeIframeAPIReady;
  document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove());
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); delete window.YT; delete window.onYouTubeIframeAPIReady; });
test("concurrent loads share one official script and resolve from the API ready callback", async () => {
  const { loadYoutubeApi } = require("./youtubeApi.js");
  const previous = jest.fn(); window.onYouTubeIframeAPIReady = previous;
  const first = loadYoutubeApi(); const second = loadYoutubeApi();
  expect(first).toBe(second);
  expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);
  window.YT = { Player: jest.fn() }; window.onYouTubeIframeAPIReady();
  await expect(first).resolves.toBe(window.YT);
  expect(previous).toHaveBeenCalledTimes(1);
  expect(window.onYouTubeIframeAPIReady).toBe(previous);
  await expect(loadYoutubeApi()).resolves.toBe(window.YT);
});
test("a failed script load rejects and a retry can load a fresh script", async () => {
  const { loadYoutubeApi } = require("./youtubeApi.js");
  const first = loadYoutubeApi();
  const rejected = expect(first).rejects.toThrow("불러오지 못했어요");
  const script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
  script.dispatchEvent(new Event("error")); await rejected;
  expect(script.isConnected).toBe(false);
  const retry = loadYoutubeApi();
  expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);
  window.YT = { Player: jest.fn() }; window.onYouTubeIframeAPIReady();
  await expect(retry).resolves.toBe(window.YT);
});
test("a missing API ready callback times out with a recoverable error", async () => {
  const { loadYoutubeApi } = require("./youtubeApi.js");
  const pending = loadYoutubeApi(); const rejected = expect(pending).rejects.toThrow("다시 시도");
  jest.advanceTimersByTime(15000); await rejected;
  expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
});
