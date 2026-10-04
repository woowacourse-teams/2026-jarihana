import { act, renderHook } from "@testing-library/react";

import { campusPositionStatus } from "../../src/pages/groups/home/pangyoCampus.js";
import { usePangyoCampus } from "../../src/pages/groups/home/usePangyoCampus.js";

jest.mock("../../src/pages/groups/home/pangyoCampus.js", () => ({
  campusPositionStatus: jest.fn()
}));

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
let getCurrentPosition;

beforeEach(() => {
  jest.useFakeTimers();
  getCurrentPosition = jest.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition }
  });
  campusPositionStatus.mockReturnValue("inside");
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  for (const [object, key, descriptor] of [
    [navigator, "geolocation", originalGeolocation],
    [document, "hidden", originalHidden]
  ]) {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else delete object[key];
  }
});

it("requests a fresh location only when explicitly invoked and expires the match", () => {
  const { result } = renderHook(() => usePangyoCampus());
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(result.current.isAtPangyo).toBe(false);
  act(() => result.current.requestLocation());
  expect(result.current.status).toBe("locating");
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  });
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  expect(result.current.isAtPangyo).toBe(true);
  act(() => jest.advanceTimersByTime(5 * 60 * 1000));
  expect(result.current.isAtPangyo).toBe(false);
  expect(result.current.status).toBe("idle");
});

it.each(["outside", "imprecise"])("does not grant a match for %s", (status) => {
  campusPositionStatus.mockReturnValue(status);
  const { result } = renderHook(() => usePangyoCampus());
  act(() => result.current.requestLocation());
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  expect(result.current.status).toBe(status);
  expect(result.current.isAtPangyo).toBe(false);
});

it.each([
  [1, "denied"],
  [2, "unavailable"],
  [3, "unavailable"]
])("handles geolocation error %s without a campus match", (code, status) => {
  const { result } = renderHook(() => usePangyoCampus());
  act(() => result.current.requestLocation());
  act(() => getCurrentPosition.mock.calls[0][1]({ code }));
  expect(result.current.status).toBe(status);
  expect(result.current.isAtPangyo).toBe(false);
});

it("handles browsers without geolocation and synchronous failures", () => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  const { result } = renderHook(() => usePangyoCampus());
  act(() => result.current.requestLocation());
  expect(result.current.status).toBe("unsupported");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: () => {
        throw new Error("Blocked");
      }
    }
  });
  act(() => result.current.requestLocation());
  expect(result.current.status).toBe("unavailable");
});

it("ignores a stale callback after another request", () => {
  const { result } = renderHook(() => usePangyoCampus());
  act(() => result.current.requestLocation());
  act(() => result.current.requestLocation());
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  expect(result.current.isAtPangyo).toBe(false);
  act(() => getCurrentPosition.mock.calls[1][1]({ code: 1 }));
  expect(result.current.status).toBe("denied");
});

it("drops the match and pending callbacks when the tab is hidden", () => {
  const { result } = renderHook(() => usePangyoCampus());
  act(() => result.current.requestLocation());
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  expect(result.current.isAtPangyo).toBe(true);
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(result.current.isAtPangyo).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  expect(result.current.status).toBe("idle");
});

it("cleans up on unmount and ignores outstanding callbacks", () => {
  const { result, unmount } = renderHook(() => usePangyoCampus());
  act(() => result.current.requestLocation());
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  unmount();
  act(() => getCurrentPosition.mock.calls[0][0]({ coords: {} }));
  expect(jest.getTimerCount()).toBe(0);
});
