import { act, fireEvent, renderHook } from "@testing-library/react";

import { useLandingQuestionScroll } from "../../../src/pages/landing/useLandingQuestionScroll";
import { useLandingGuideScroll } from "../../../src/pages/landing/useLandingGuideScroll";

const originalCSS = window.CSS;
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
const stops = [64, 766, 1252, 1738, 2494];

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(window, "innerHeight", 900);
  jest.replaceProperty(window, "scrollY", 0);
  Object.defineProperty(window, "CSS", {
    configurable: true,
    value: { supports: jest.fn(() => true) }
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({ matches: false }))
  });
  jest.spyOn(window, "scrollTo").mockImplementation(({ top }) => {
    window.scrollY = top;
  });
});

afterEach(() => {
  document.querySelectorAll("[data-handoff-fixture]").forEach((node) => node.remove());
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(window, "CSS", { configurable: true, value: originalCSS });
  Object.defineProperty(window, "matchMedia", originalMatchMedia);
});

function setup({ withAbout = false, withGuide = false } = {}) {
  const hero = document.createElement("section");
  hero.getBoundingClientRect = () => ({
    top: 64 - window.scrollY,
    bottom: 3664 - window.scrollY,
    height: 3600
  });
  const root = document.createElement("main");
  const activate = jest.fn();
  if (withAbout) {
    root.dataset.handoffFixture = "";
    root.append(hero);
    for (const [index, id] of ["about", "together"].entries()) {
      const section = document.createElement("section");
      section.dataset.guideChapter = id;
      section.getBoundingClientRect = () => ({ top: 3664 + index * 836 - window.scrollY, height: 836 });
      root.append(section);
    }
    document.body.append(root);
  }
  if (withGuide) {
    window.matchMedia.mockImplementation((query) => ({
      matches: query !== "(prefers-reduced-motion: reduce)",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));
    const heroRef = { current: hero };
    const rootRef = { current: root };
    const hook = renderHook(() => {
      useLandingQuestionScroll(heroRef);
      useLandingGuideScroll(rootRef, activate);
    });
    return { ...hook, activate };
  }
  return { ...renderHook(() => useLandingQuestionScroll({ current: hero })), hero };
}

function advance(milliseconds = 550) {
  act(() => jest.advanceTimersByTime(milliseconds));
}

function wheel(deltaY, options = {}) {
  const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true, ...options });
  Object.defineProperty(event, "timeStamp", { value: performance.now() });
  if ("momentum" in options) Object.defineProperty(event, "momentum", { value: options.momentum });
  fireEvent(window, event);
  return event;
}

function fadingGesture(direction = 1) {
  for (let index = 0; index < 36; index += 1) {
    wheel(direction * 240 * 0.88 ** index);
    advance(20);
  }
}

test.each([1, -1])("long wheel momentum cannot skip a question (direction %i)", (direction) => {
  setup();
  if (direction < 0) window.scrollY = stops[3];
  expect(wheel(1450 * direction).defaultPrevented).toBe(true);
  for (let count = 0; count < 20; count += 1) {
    advance(100);
    expect(wheel(direction * Math.max(12, 300 - count * 16)).defaultPrevented).toBe(true);
  }
  expect(window.scrollY).toBeCloseTo(stops[direction > 0 ? 1 : 2]);
  advance(300);
  wheel(100 * direction);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[direction > 0 ? 2 : 1]);
});

test.each([1, -1])("an isolated spike in fading momentum does not skip a question (direction %i)", (direction) => {
  setup();
  if (direction < 0) window.scrollY = stops[3];
  for (const delta of [240, 160, 100, 60, 30, 12, 8, 4, 2, 1, 12, 11, 10, 9, 8, 7, 6, 5]) {
    wheel(delta * direction);
    advance(90);
  }
  expect(window.scrollY).toBeCloseTo(stops[direction > 0 ? 1 : 2]);
});

test("a fresh swipe during detected inertia responds without waiting for an idle gap", () => {
  setup();
  fadingGesture();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  wheel(90);
  advance(20);
  wheel(160);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[2]);
});

test("new inputs work immediately after the transition finishes instead of a reading cooldown", () => {
  setup();
  for (let index = 1; index <= 3; index += 1) {
    wheel(160);
    advance(540);
    expect(window.scrollY).toBeCloseTo(stops[index]);
  }
});

test("a new gesture begun during a transition needs continued input, never a queued automatic step", () => {
  setup();
  wheel(160);
  advance(300);
  for (let index = 0; index < 3; index += 1) {
    wheel(100);
    advance(80);
  }
  expect(window.scrollY).toBeCloseTo(stops[1]);
  wheel(100);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[2]);
});

test("a gesture that ends during a transition does not advance again later", () => {
  setup();
  wheel(160);
  advance(300);
  wheel(160);
  advance(1000);
  expect(window.scrollY).toBeCloseTo(stops[1]);
  wheel(160);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[2]);
});

test("acceleration without prior decay and tiny fluctuations do not rearm a consumed gesture", () => {
  setup();
  wheel(40);
  for (const delta of [60, 90, 140, 210, 300, 100, 20, 2, 3, 6, 2, 5, 2, 7]) {
    advance(100);
    wheel(delta);
  }
  expect(window.scrollY).toBeCloseTo(stops[1]);
});

test("a deliberate reversal responds during the old momentum tail", () => {
  setup();
  fadingGesture();
  wheel(-80);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[0]);
});

test("the chair unfolds fully and the same gesture cannot spill into native scrolling", () => {
  setup();
  window.scrollY = stops[3];
  wheel(1500);
  advance(700);
  expect(window.scrollY).toBeGreaterThan(stops[3]);
  expect(window.scrollY).toBeLessThan(stops[4]);
  for (let index = 0; index < 60; index += 1) {
    expect(wheel(100).defaultPrevented).toBe(true);
    advance(20);
  }
  expect(window.scrollY).toBeCloseTo(stops[4]);
  advance(300);
  expect(wheel(100).defaultPrevented).toBe(false);
});

test("browser-marked inertia cannot advance or escape the chair scene", () => {
  setup();
  window.scrollY = stops[3];
  wheel(120, { momentum: false });
  for (let index = 0; index < 90; index += 1) {
    advance(20);
    expect(wheel(12, { momentum: true }).defaultPrevented).toBe(true);
  }
  expect(window.scrollY).toBeCloseTo(stops[4]);
  expect(wheel(80, { momentum: false }).defaultPrevented).toBe(false);
});

test.each([60, 1600])("a fresh %ipx gesture after the chair lands on About and hands the next input to the guide", (delta) => {
  const { activate } = setup({ withAbout: true, withGuide: true });
  window.scrollY = stops[4];
  expect(wheel(delta, { momentum: false }).defaultPrevented).toBe(true);
  advance(200);
  expect(window.scrollY).toBeGreaterThan(stops[4]);
  expect(window.scrollY).toBeLessThan(3600);
  for (let index = 0; index < 12; index += 1) {
    advance(90);
    expect(wheel(20, { momentum: true }).defaultPrevented).toBe(true);
  }
  expect(window.scrollY).toBeCloseTo(3600);
  expect(activate).not.toHaveBeenCalled();
  expect(wheel(120, { momentum: false }).defaultPrevented).toBe(true);
  advance();
  expect(window.scrollY).toBeCloseTo(4436);
  expect(activate).toHaveBeenLastCalledWith("together");
  wheel(-120, { momentum: false });
  advance();
  expect(window.scrollY).toBeCloseTo(3600);
  wheel(-120, { momentum: false });
  advance();
  expect(window.scrollY).toBeCloseTo(stops[4]);
});

test("the final question finishes the chair before a separate input reaches About", () => {
  setup({ withAbout: true });
  window.scrollY = stops[3];
  wheel(1600, { momentum: false });
  for (let index = 0; index < 15; index += 1) {
    advance(90);
    expect(wheel(15, { momentum: true }).defaultPrevented).toBe(true);
  }
  expect(window.scrollY).toBeCloseTo(stops[4]);
  wheel(80, { momentum: false });
  advance();
  expect(window.scrollY).toBeCloseTo(3600);
});

test("delayed browser-marked momentum stays captured at About until a fresh gesture", () => {
  setup({ withAbout: true });
  window.scrollY = stops[4];
  wheel(120, { momentum: false });
  advance(900);
  expect(window.scrollY).toBeCloseTo(3600);
  expect(wheel(12, { momentum: true }).defaultPrevented).toBe(true);
  advance(300);
  expect(wheel(8, { momentum: true }).defaultPrevented).toBe(true);
  expect(window.scrollY).toBeCloseTo(3600);
  expect(wheel(120, { momentum: false }).defaultPrevented).toBe(false);
});

test("keyboard and touch can move between the chair and About without capturing later content", () => {
  setup({ withAbout: true });
  window.scrollY = stops[4];
  expect(fireEvent.keyDown(document.body, { key: "PageDown" })).toBe(false);
  advance();
  expect(window.scrollY).toBeCloseTo(3600);
  expect(fireEvent.keyDown(document.body, { key: "PageDown" })).toBe(true);
  fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 200 }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 500 }] });
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[4]);
  fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 700 }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 500 }] });
  advance();
  expect(window.scrollY).toBeCloseTo(3600);
  expect(fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 100 }] })).toBe(false);
  fireEvent.touchEnd(window);
  window.scrollY = 4000;
  expect(wheel(100)).toHaveProperty("defaultPrevented", false);
});

test.each(["navigation", "reduced motion", "unmount"])("animation yields to %s", (reason) => {
  const preference = { matches: false };
  window.matchMedia.mockReturnValue(preference);
  const { unmount } = setup();
  window.scrollY = stops[3];
  wheel(1500);
  advance(300);
  if (reason === "navigation") window.scrollY = 5000;
  if (reason === "reduced motion") preference.matches = true;
  if (reason === "unmount") unmount();
  const stoppedAt = window.scrollY;
  advance(1500);
  expect(window.scrollY).toBe(stoppedAt);
  expect(wheel(1500).defaultPrevented).toBe(false);
});

test("small deltas accumulate and line and page units are normalized", () => {
  setup();
  wheel(10);
  wheel(10);
  expect(window.scrollTo).not.toHaveBeenCalled();
  wheel(20);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  wheel(3, { deltaMode: 1 });
  advance();
  expect(window.scrollY).toBeCloseTo(stops[2]);
  wheel(1, { deltaMode: 2 });
  advance();
  expect(window.scrollY).toBeCloseTo(stops[3]);
});

test("one touch swipe advances one step and can reverse", () => {
  setup();
  fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 750 }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 600 }] });
  advance();
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 100 }] });
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 100 }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 600 }] });
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[0]);
});

test("a touch begun during transition works when movement continues after completion", () => {
  setup();
  wheel(160);
  advance(300);
  fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 750 }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 600 }] });
  advance(240);
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 300 }] });
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[2]);
});

test("keyboard navigation is staged while links, key repeats and Home/End retain their roles", () => {
  setup();
  fireEvent.keyDown(document.body, { key: "PageDown" });
  advance();
  fireEvent.keyDown(document.body, { key: "PageDown", repeat: true });
  fireEvent.keyDown(document.body, { key: "End" });
  fireEvent.keyDown(document.body, { key: "Home" });
  const button = document.createElement("button");
  document.body.append(button);
  fireEvent.keyDown(button, { key: " " });
  button.remove();
  advance();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  fireEvent.keyDown(document.body, { key: " ", shiftKey: true });
  advance();
  expect(window.scrollY).toBeCloseTo(stops[0]);
});

test("horizontal scrolling, zoom, first upward input and navigation outside the hero stay native", () => {
  setup();
  expect(wheel(100, { deltaX: 150 }).defaultPrevented).toBe(false);
  expect(wheel(100, { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(wheel(-500).defaultPrevented).toBe(false);
  expect(window.scrollTo).not.toHaveBeenCalled();
  window.scrollY = 5000;
  expect(wheel(-1000).defaultPrevented).toBe(false);
});

test("reduced motion, unsupported timelines and unmount leave native inputs alone", () => {
  const preference = { matches: true };
  window.matchMedia.mockReturnValue(preference);
  const { unmount } = setup();
  expect(wheel(1500).defaultPrevented).toBe(false);
  preference.matches = false;
  advance();
  wheel(1500);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  unmount();
  expect(wheel(1500).defaultPrevented).toBe(false);
  window.CSS.supports.mockReturnValue(false);
  setup();
  expect(wheel(1500).defaultPrevented).toBe(false);
});

function unsupportedPhone({ width = 390, height = 844, coarse = true, reduced = false } = {}) {
  window.CSS.supports.mockReturnValue(false);
  jest.spyOn(window.screen, "width", "get").mockReturnValue(width);
  jest.spyOn(window.screen, "height", "get").mockReturnValue(height);
  const preference = new EventTarget();
  preference.matches = reduced;
  window.matchMedia.mockImplementation((query) => query === "(prefers-reduced-motion: reduce)"
    ? preference
    : { matches: coarse, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  return preference;
}

function swipe(from = 700, to = 200) {
  fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: from }] });
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: to }] });
}

test("an unsupported phone advances one question per swipe, reverses and reveals the chair", () => {
  unsupportedPhone();
  const { hero } = setup({ withAbout: true });
  expect(hero).toHaveAttribute("data-phone-timeline");
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("0s");
  swipe();
  advance();
  expect(window.scrollY).toBe(0);
  fireEvent.touchMove(window, { touches: [{ clientX: 180, clientY: 50 }] });
  advance();
  expect(window.scrollY).toBe(0);
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("0.26s");
  swipe(200, 700);
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[0]);
  for (const stop of stops.slice(1)) {
    swipe();
    fireEvent.touchEnd(window);
    advance(1150);
    expect(window.scrollY).toBeCloseTo(stop);
  }
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("0.9s");
  swipe();
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(3600);
  swipe(200, 700);
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[4]);
});

test("phone short swipes settle after release despite delayed browser scroll updates", () => {
  unsupportedPhone();
  setup();
  for (const stop of stops.slice(1, 4)) {
    swipe(700, 670);
    expect(window.scrollTo).not.toHaveBeenCalled();
    fireEvent.touchEnd(window);
    advance(100);
    window.scrollY += 5;
    advance();
    expect(window.scrollY).toBeCloseTo(stop);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: stop, behavior: "auto" });
    window.scrollTo.mockClear();
  }
});

test("cancelled phone touches never advance a question", () => {
  unsupportedPhone();
  setup();
  swipe(700, 670);
  fireEvent.touchCancel(window);
  advance();
  expect(window.scrollTo).not.toHaveBeenCalled();
});

test("phone claims vertical navigation before the browser starts native scrolling", () => {
  unsupportedPhone();
  setup();
  expect(fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 700 }] })).toBe(false);
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollTo).not.toHaveBeenCalled();
  window.scrollY = 5000;
  expect(fireEvent.touchStart(window, { touches: [{ clientX: 180, clientY: 700 }] })).toBe(true);
});

test("phone releases the About boundary to the guide's swipe controller", () => {
  unsupportedPhone();
  setup({ withAbout: true, withGuide: true });
  window.scrollY = 3600;
  swipe(700, 670);
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(4436);
});

test.each([
  { width: 768, height: 1024 },
  { width: 600, height: 960 },
  { width: 1440, height: 900 },
  { width: 390, height: 844, coarse: false }
])("unsupported desktop and tablet keep native scrolling even in a narrow window: %j", (device) => {
  unsupportedPhone(device);
  jest.replaceProperty(window, "innerWidth", 390);
  const { hero } = setup();
  expect(hero).not.toHaveAttribute("data-phone-timeline");
  swipe();
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBe(0);
  expect(wheel(1000).defaultPrevented).toBe(false);
});

test("phone rotation and browser toolbar resizing preserve the question position", () => {
  unsupportedPhone({ width: 844, height: 390 });
  const { hero } = setup();
  window.scrollY = stops[2];
  fireEvent.scroll(window);
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("0.44s");
  jest.replaceProperty(window, "innerHeight", 780);
  fireEvent.resize(window);
  swipe();
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[3]);
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("0.62s");
});

test("phone fallback yields to reduced motion, navigation and unmount", () => {
  const preference = unsupportedPhone({ reduced: true });
  const { hero, unmount } = setup();
  expect(hero).not.toHaveAttribute("data-phone-timeline");
  swipe();
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBe(0);
  preference.matches = false;
  act(() => preference.dispatchEvent(new Event("change")));
  expect(hero).toHaveAttribute("data-phone-timeline");
  swipe();
  fireEvent.touchEnd(window);
  advance();
  window.scrollY = 5000;
  fireEvent.scroll(window);
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("1s");
  expect(wheel(1000).defaultPrevented).toBe(false);
  preference.matches = true;
  act(() => preference.dispatchEvent(new Event("change")));
  expect(hero).not.toHaveAttribute("data-phone-timeline");
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("");
  unmount();
  expect(wheel(-1000).defaultPrevented).toBe(false);
});

test("a phone with native timeline support keeps the original path", () => {
  unsupportedPhone();
  window.CSS.supports.mockReturnValue(true);
  const { hero } = setup();
  swipe();
  fireEvent.touchEnd(window);
  advance();
  expect(window.scrollY).toBeCloseTo(stops[1]);
  expect(hero).not.toHaveAttribute("data-phone-timeline");
  expect(hero.style.getPropertyValue("--landing-phone-time")).toBe("");
});
