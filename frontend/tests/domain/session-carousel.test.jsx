import { act, renderHook } from "@testing-library/react";
import { useSessionCarousel } from "../../src/pages/groups/home/useSessionCarousel.js";

let motionChange;
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({
      matches: false,
      addEventListener: (type, listener) => {
        motionChange = listener;
      },
      removeEventListener: jest.fn()
    }))
  });
});
afterEach(() => jest.useRealTimers());

it("rotates every five seconds, wraps, and releases the timer on unmount", () => {
  const { result, unmount } = renderHook(() => useSessionCarousel(3));
  act(() => jest.advanceTimersByTime(5000));
  expect(result.current.activeIndex).toBe(1);
  act(() => jest.advanceTimersByTime(10000));
  expect(result.current.activeIndex).toBe(0);
  expect(result.current.activePosition).toBe(3);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("keeps forward and backward movement distinct when two items wrap", () => {
  const { result } = renderHook(() => useSessionCarousel(2));
  act(() => result.current.goPrevious({ pause: true }));
  expect(result.current.activeIndex).toBe(1);
  expect(result.current.activePosition).toBe(-1);
  act(() => result.current.goNext());
  expect(result.current.activePosition).toBe(0);
  act(() => result.current.goNext());
  act(() => result.current.goNext());
  expect(result.current.activeIndex).toBe(0);
  expect(result.current.activePosition).toBe(2);
});

it("selects the nearest occurrence for dots and keeps the current dot stationary", () => {
  const { result } = renderHook(() => useSessionCarousel(6));
  act(() => result.current.goTo(5, { pause: true }));
  expect(result.current.activePosition).toBe(-1);
  act(() => result.current.goTo(0));
  expect(result.current.activePosition).toBe(0);
  act(() => result.current.goTo(3));
  expect(result.current.activePosition).toBe(3);
  act(() => result.current.goTo(3));
  expect(result.current.activePosition).toBe(3);
});

it("keeps focus pause when the pointer leaves, and preserves manual pause until replay", () => {
  const { result } = renderHook(() => useSessionCarousel(3));
  act(() => {
    result.current.pauseFocus();
    result.current.pauseHover();
  });
  act(() => result.current.resumeHover());
  act(() => jest.advanceTimersByTime(15000));
  expect(result.current.activeIndex).toBe(0);
  act(() => result.current.resumeFocus());
  act(() => jest.advanceTimersByTime(5000));
  expect(result.current.activeIndex).toBe(1);
  act(() => result.current.goNext({ pause: true }));
  act(() => jest.advanceTimersByTime(20000));
  expect(result.current.activeIndex).toBe(2);
  act(() => result.current.setUserPaused(false));
  act(() => jest.advanceTimersByTime(5000));
  expect(result.current.activeIndex).toBe(0);
});

it("pauses in a hidden tab and when reduced motion is enabled while preserving manual controls", () => {
  const { result } = renderHook(() => useSessionCarousel(3));
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => jest.advanceTimersByTime(10000));
  expect(result.current.activeIndex).toBe(0);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    motionChange({ matches: true });
  });
  act(() => jest.advanceTimersByTime(10000));
  expect(result.current.activeIndex).toBe(0);
  act(() => result.current.goPrevious({ pause: true }));
  expect(result.current.activeIndex).toBe(2);
});

it("keeps a valid index as the list shrinks and never schedules zero or one item", () => {
  const { result, rerender } = renderHook(({ count }) => useSessionCarousel(count), {
    initialProps: { count: 4 }
  });
  act(() => result.current.goTo(3));
  rerender({ count: 2 });
  expect(result.current.activeIndex).toBe(1);
  rerender({ count: 0 });
  expect(result.current.activeIndex).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  rerender({ count: 1 });
  expect(jest.getTimerCount()).toBe(0);
});


it("starts at the saved carousel position before the first rotation", () => {
  const { result } = renderHook(() => useSessionCarousel(6, { initialIndex: 4 }));
  expect(result.current.activeIndex).toBe(4);
  act(() => result.current.pauseFocus());
  act(() => jest.advanceTimersByTime(10000));
  expect(result.current.activeIndex).toBe(4);
});
