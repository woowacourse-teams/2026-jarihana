import { act, fireEvent, renderHook } from "@testing-library/react";

import { useLandingGuideScroll } from "../../../src/pages/landing/useLandingGuideScroll";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
let desktop;

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(window, "innerHeight", 1000);
  jest.replaceProperty(window, "scrollY", 1000);
  desktop = { matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => desktop) });
  jest.spyOn(window, "scrollTo").mockImplementation(({ top }) => { window.scrollY = top; });
});

afterEach(() => {
  document.querySelectorAll("[data-guide-sequence], [data-guide-flow]").forEach((node) => node.remove());
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(window, "matchMedia", originalMatchMedia);
});

function setup({ ids = ["browse", "detail", "continue"], top = 1000, sequences, height = 936 } = {}) {
  if (sequences) ids = sequences.flat();
  const root = document.createElement("section");
  if (sequences) root.dataset.guideFlow = "";
  else root.dataset.guideSequence = "";
  root.getBoundingClientRect = () => ({ top: top - 600 - window.scrollY, bottom: top + ids.length * height + 64 - window.scrollY });
  document.body.append(root);
  const sequenceRoots = sequences?.map((sequenceIds, sequenceIndex) => {
    const sequence = document.createElement("section");
    sequence.dataset.guideSequence = "";
    const firstIndex = sequences.slice(0, sequenceIndex).flat().length;
    sequence.getBoundingClientRect = () => ({
      top: top + 64 + firstIndex * height - window.scrollY,
      bottom: top + 64 + (firstIndex + sequenceIds.length) * height - window.scrollY,
    });
    root.append(sequence);
    return sequence;
  });
  ids.forEach((id, index) => {
    const chapter = document.createElement("article");
    chapter.dataset.guideChapter = id;
    chapter.getBoundingClientRect = () => ({ top: top + 64 + index * height - window.scrollY, height });
    const sequenceIndex = sequences?.findIndex((sequenceIds) => sequenceIds.includes(id));
    (sequenceRoots?.[sequenceIndex] ?? root).append(chapter);
  });
  const sectionRef = { current: root };
  const activate = jest.fn();
  const hook = renderHook(() => useLandingGuideScroll(sectionRef, activate));
  return { ...hook, activate };
}

function wheel(deltaY, options = {}) {
  const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true, ...options });
  Object.defineProperty(event, "timeStamp", { value: performance.now() });
  if ("momentum" in options) Object.defineProperty(event, "momentum", { value: options.momentum });
  fireEvent(window, event);
  return event;
}

function advance(time = 600) {
  act(() => jest.advanceTimersByTime(time));
}

test("each fresh gesture settles at one complete chapter in either direction", () => {
  const { activate, result } = setup();
  for (const [delta, id, top] of [[1600, "detail", 1936], [100, "continue", 2872], [-100, "detail", 1936], [-100, "browse", 1000]]) {
    expect(wheel(delta).defaultPrevented).toBe(true);
    expect(result.current.current).toBe(true);
    advance(250);
    expect(window.scrollY).not.toBe(top);
    advance(350);
    expect(window.scrollY).toBe(top);
    expect(result.current.current).toBe(false);
    expect(activate).toHaveBeenLastCalledWith(id);
  }
});

test("long wheel momentum cannot skip a chapter or spill past the last stop", () => {
  const { activate } = setup();
  for (const expected of [1936, 2872]) {
    wheel(1600);
    for (let index = 0; index < 20; index += 1) {
      advance(90);
      expect(wheel(Math.max(3, 300 - index * 20)).defaultPrevented).toBe(true);
    }
    expect(window.scrollY).toBe(expected);
    advance(230);
  }
  expect(activate.mock.calls).toEqual([["detail"], ["continue"]]);
  expect(wheel(200).defaultPrevented).toBe(false);
});

test("a new swipe during a fading tail works without waiting for a complete idle gap", () => {
  const { activate } = setup();
  for (const delta of [240, 160, 100, 60, 30, 12, 8, 4, 2, 3, 15, 90, 160, 110, 70, 30, 8, 2]) {
    wheel(delta);
    advance(90);
  }
  expect(activate.mock.calls).toEqual([["detail"], ["continue"]]);
  expect(window.scrollY).toBe(2872);
});

test("a new gesture during a transition is not queued and responds only to further input", () => {
  const { activate } = setup();
  wheel(100);
  advance(300);
  wheel(100);
  advance(300);
  expect(activate).toHaveBeenCalledTimes(1);
  wheel(100);
  advance();
  expect(activate).toHaveBeenCalledTimes(2);
  expect(window.scrollY).toBe(2872);
});

test.each([[850, 100, 1000], [3100, -100, 2872], [200, 1500, 1000], [3700, -1500, 2872]])(
  "entry from %i with delta %i lands at the first encountered stop %i", (start, delta, end) => {
    setup();
    window.scrollY = start;
    wheel(delta);
    advance();
    expect(window.scrollY).toBe(end);
  }
);

test("boundaries and unrelated sections keep native scrolling", () => {
  setup();
  for (const [top, delta] of [[1000, -100], [2872, 100], [0, 100], [4200, -100]]) {
    window.scrollY = top;
    expect(wheel(delta).defaultPrevented).toBe(false);
    advance(20);
  }
  expect(window.scrollTo).not.toHaveBeenCalled();
});

test("a chapter reached by an anchor advances immediately despite its small header offset", () => {
  setup();
  window.scrollY = 1000 - 52;
  wheel(100);
  advance();
  expect(window.scrollY).toBe(1936);
});

test("small deltas accumulate while zoom and horizontal gestures remain native", () => {
  setup();
  expect(wheel(100, { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(wheel(100, { deltaX: 150 }).defaultPrevented).toBe(false);
  wheel(12);
  advance(16);
  wheel(12);
  advance(16);
  wheel(12);
  advance(16);
  expect(window.scrollTo).not.toHaveBeenCalled();
  wheel(12);
  advance();
  expect(window.scrollY).toBe(1936);
});

test("reduced motion keeps native scrolling", () => {
  desktop.matches = false;
  setup();
  expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: no-preference)");
  expect(wheel(100).defaultPrevented).toBe(false);
  fireEvent.keyDown(window, { key: "PageDown" });
  advance();
  expect(window.scrollTo).not.toHaveBeenCalled();
});

test.each([[468, 853], [1456, 768]])("guide stepping stays enabled at %ix%i", (width, height) => {
  jest.replaceProperty(window, "innerWidth", width);
  jest.replaceProperty(window, "innerHeight", height);
  window.matchMedia.mockImplementation((query) => ({
    ...desktop,
    matches: (!query.includes("min-width") || width >= 1024) &&
      (!query.includes("height >") || height > 832),
  }));
  const { activate } = setup({ height: height - 64 });
  expect(wheel(1600).defaultPrevented).toBe(true);
  advance();
  expect(window.scrollY).toBe(1000 + height - 64);
  expect(activate).toHaveBeenLastCalledWith("detail");
});

test("tall chapters are read from top to bottom before changing chapters", () => {
  const { activate } = setup({ height: 2200 });
  for (const [direction, top, id] of [
    [1, 1632, "browse"], [1, 2264, "browse"], [1, 3200, "detail"],
    [-1, 2264, "browse"], [-1, 1632, "browse"], [-1, 1000, "browse"],
  ]) {
    expect(wheel(1600 * direction).defaultPrevented).toBe(true);
    advance();
    expect(window.scrollY).toBe(top);
    expect(activate).toHaveBeenLastCalledWith(id);
  }
});

test("touch swipes move one stop, retain their tail, and allow reversing", () => {
  const { activate } = setup();
  fireEvent.touchStart(window, { touches: [{ clientX: 200, clientY: 600 }] });
  expect(fireEvent.touchMove(window, { touches: [{ clientX: 200, clientY: 500 }] })).toBe(false);
  advance();
  expect(window.scrollY).toBe(1936);
  expect(fireEvent.touchMove(window, { touches: [{ clientX: 200, clientY: 200 }] })).toBe(false);
  advance();
  expect(activate).toHaveBeenCalledTimes(1);
  fireEvent.touchEnd(window, { touches: [] });
  fireEvent.touchStart(window, { touches: [{ clientX: 200, clientY: 200 }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 200, clientY: 350 }] });
  advance();
  expect(window.scrollY).toBe(1000);
});

test("horizontal touch gestures and pinch zoom remain native", () => {
  setup();
  fireEvent.touchStart(window, { touches: [{ clientX: 200, clientY: 600 }] });
  expect(fireEvent.touchMove(window, { touches: [{ clientX: 300, clientY: 590 }] })).toBe(true);
  fireEvent.touchStart(window, { touches: [{ clientX: 100, clientY: 500 }, { clientX: 200, clientY: 600 }] });
  expect(fireEvent.touchMove(window, { touches: [{ clientX: 100, clientY: 200 }, { clientX: 200, clientY: 300 }] })).toBe(true);
  advance();
  expect(window.scrollTo).not.toHaveBeenCalled();
});

test("keyboard steps once, ignores held keys and leaves focused controls alone", () => {
  const { activate } = setup();
  fireEvent.keyDown(window, { key: "PageDown" });
  advance();
  fireEvent.keyDown(window, { key: "PageDown", repeat: true });
  advance();
  expect(activate).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { key: "ArrowUp" });
  advance();
  expect(window.scrollY).toBe(1000);
  const button = document.createElement("button");
  document.body.append(button);
  fireEvent.keyDown(button, { key: " " });
  button.remove();
  expect(activate).toHaveBeenCalledTimes(2);
});

test.each(["resize", "pointerdown", "hashchange", "Home", "End", "media", "navigation", "anchor", "unmount"])(
  "animation yields immediately to %s", (reason) => {
    const { unmount, result } = setup();
    wheel(100);
    advance(200);
    if (reason === "unmount") unmount();
    else if (reason === "media") {
      desktop.matches = false;
      desktop.addEventListener.mock.calls[0][1]();
    } else if (reason === "navigation") window.scrollY = 6000;
    else if (reason === "Home" || reason === "End") fireEvent.keyDown(window, { key: reason });
    else if (reason === "anchor") {
      const link = document.createElement("a");
      link.href = "#guide-invite";
      document.body.append(link);
      fireEvent.click(link);
      link.remove();
    } else fireEvent(window, new Event(reason));
    const stopped = window.scrollY;
    advance();
    expect(window.scrollY).toBe(stopped);
    expect(result.current.current).toBe(false);
  }
);

test("a large reverse gesture stays in the visible host guide instead of jumping to participation", () => {
  const participation = setup();
  const host = setup({ ids: ["create", "manage"], top: 6000 });
  window.scrollY = 6936;
  expect(wheel(-6000).defaultPrevented).toBe(true);
  advance();
  expect(window.scrollY).toBe(6000);
  expect(host.activate).toHaveBeenLastCalledWith("create");
  expect(participation.activate).not.toHaveBeenCalled();

  window.scrollY = 1000;
  wheel(6000);
  advance();
  expect(window.scrollY).toBe(1936);
  expect(participation.activate).toHaveBeenLastCalledWith("detail");
  expect(host.activate).toHaveBeenCalledTimes(1);
});

test.each([1, -1])("a spike in guide inertia does not consume another chapter (direction %i)", (direction) => {
  const { activate } = setup();
  if (direction < 0) window.scrollY = 2872;
  for (const delta of [240, 160, 100, 60, 30, 12, 8, 4, 2, 1, 12, 11, 10, 9, 8, 7, 6, 5]) {
    wheel(delta * direction);
    advance(90);
  }
  expect(window.scrollY).toBe(1936);
  expect(activate).toHaveBeenCalledTimes(1);
});

test("browser-marked momentum cannot skip a chapter after an input pause", () => {
  const { activate } = setup();
  wheel(100, { momentum: false });
  advance(600);
  for (let index = 0; index < 6; index += 1) {
    expect(wheel(90, { momentum: true }).defaultPrevented).toBe(true);
    advance(240);
  }
  expect(window.scrollY).toBe(1936);
  expect(activate).toHaveBeenCalledTimes(1);
  wheel(100, { momentum: false });
  advance();
  expect(window.scrollY).toBe(2872);
  for (let index = 0; index < 3; index += 1) {
    expect(wheel(90, { momentum: true }).defaultPrevented).toBe(true);
    advance(240);
  }
  expect(activate).toHaveBeenCalledTimes(2);
  expect(wheel(100, { momentum: false }).defaultPrevented).toBe(false);
});

test("a deliberate reversal responds during the fading guide gesture", () => {
  const { activate } = setup();
  for (let index = 0; index < 36; index += 1) {
    wheel(240 * 0.88 ** index);
    advance(20);
  }
  wheel(-80);
  advance();
  expect(window.scrollY).toBe(1000);
  expect(activate.mock.calls).toEqual([["detail"], ["browse"]]);
});

const allGuideSequences = [
  ["about"],
  ["together"],
  ["participate-intro", "browse", "detail", "continue"],
  ["host-intro", "create", "manage"],
  ["invite-intro", "invite"],
  ["activity-intro", "activity"],
  ["start"],
];

test("all fourteen stops from service introduction through CTA hold inertial tails in both directions", () => {
  const { activate } = setup({ sequences: allGuideSequences });
  const ids = allGuideSequences.flat();
  window.scrollY = 850;
  const steps = [...ids.map((id, index) => ({ id, index, direction: 1 })),
    ...ids.slice(0, -1).map((id, index) => ({ id, index, direction: -1 })).reverse()];

  for (const [stepIndex, { id, index, direction }] of steps.entries()) {
    expect(wheel(1600 * direction, { momentum: false }).defaultPrevented).toBe(true);
    for (let tick = 0; tick < 10; tick += 1) {
      advance(90);
      expect(wheel(Math.max(3, 300 - tick * 40) * direction, { momentum: true }).defaultPrevented).toBe(true);
    }
    expect(window.scrollY).toBe(1000 + index * 936);
    expect(activate).toHaveBeenCalledTimes(stepIndex + 1);
    expect(activate).toHaveBeenLastCalledWith(id);
    advance(240);
    if (id === "start") expect(wheel(200, { momentum: false }).defaultPrevented).toBe(false);
  }

  expect(wheel(-200, { momentum: false }).defaultPrevented).toBe(false);
  expect(activate.mock.calls).toEqual(steps.map(({ id }) => [id]));
});

test("keyboard steps through every major introduction and demonstration in both directions", () => {
  const { activate } = setup({ sequences: allGuideSequences });
  const ids = allGuideSequences.flat();
  expect(fireEvent.keyDown(window, { key: "PageUp" })).toBe(true);
  expect(activate).not.toHaveBeenCalled();
  for (let index = 1; index < ids.length; index += 1) {
    expect(fireEvent.keyDown(window, { key: "PageDown" })).toBe(false);
    advance();
    expect(window.scrollY).toBe(1000 + index * 936);
    expect(activate).toHaveBeenLastCalledWith(ids[index]);
  }
  expect(fireEvent.keyDown(window, { key: "PageDown" })).toBe(true);
  for (let index = ids.length - 2; index >= 0; index -= 1) {
    expect(fireEvent.keyDown(window, { key: "PageUp" })).toBe(false);
    advance();
    expect(window.scrollY).toBe(1000 + index * 936);
    expect(activate).toHaveBeenLastCalledWith(ids[index]);
  }
  expect(fireEvent.keyDown(window, { key: "PageUp" })).toBe(true);
  expect(activate.mock.calls).toEqual([...ids.slice(1), ...ids.slice(0, -1).reverse()].map((id) => [id]));
});

test("manual scrolling selects the visible chapter without interrupting a gesture transition", () => {
  const { activate } = setup();
  act(() => global.triggerIntersection());
  expect(activate).toHaveBeenLastCalledWith("browse");
  wheel(100);
  expect(activate).toHaveBeenLastCalledWith("detail");
  act(() => global.triggerIntersection());
  expect(activate).toHaveBeenLastCalledWith("detail");
  advance();
  window.scrollY = 2872;
  act(() => global.triggerIntersection());
  expect(activate).toHaveBeenLastCalledWith("continue");
});
