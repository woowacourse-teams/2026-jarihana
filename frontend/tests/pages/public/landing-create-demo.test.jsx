import { act, fireEvent, render, screen } from "@testing-library/react";

import { LandingCreateDemo } from "../../../src/pages/landing/LandingCreateDemo";

let intersect;
let disconnect;
let originalObserver;
let originalMatchMedia;

beforeEach(() => {
  originalObserver = global.IntersectionObserver;
  originalMatchMedia = window.matchMedia;
  disconnect = jest.fn();
  global.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe() {}
    disconnect() { disconnect(); }
  };
});

afterEach(() => {
  global.IntersectionObserver = originalObserver;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
});

test("demo starts on entry, restarts offscreen, finishes once and can replay", () => {
  const { container, unmount } = render(<LandingCreateDemo label="모임 만들기 이용 예시" />);
  const scene = () => container.querySelector(".lpc-scene");
  const enter = () => act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.6 }]));
  expect(scene()).toHaveAttribute("data-state", "idle");
  expect(screen.getByRole("img")).toHaveAccessibleName("모임 만들기 이용 예시");
  expect(screen.getByRole("img").querySelector("button, input, textarea, select")).toBeNull();

  enter();
  expect(scene()).toHaveAttribute("data-state", "running");
  expect(scene()).toHaveAttribute("data-paused", "false");
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  expect(scene()).toHaveAttribute("data-paused", "true");
  act(() => intersect([{ isIntersecting: false, intersectionRatio: 0 }]));
  expect(scene()).toHaveAttribute("data-state", "idle");
  enter();
  expect(scene()).toHaveAttribute("data-state", "running");
  expect(scene()).toHaveAttribute("data-paused", "false");
  act(() => intersect([{ isIntersecting: false, intersectionRatio: 0 }]));
  expect(scene()).toHaveAttribute("data-state", "idle");
  enter();
  expect(scene()).toHaveAttribute("data-paused", "false");

  fireEvent.animationEnd(container.querySelector(".lpc-timeline-sentinel"));
  expect(scene()).toHaveAttribute("data-state", "complete");
  expect(screen.getByRole("button", { name: "일시정지" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다시보기" }));
  expect(scene()).toHaveAttribute("data-state", "running");
  expect(scene()).toHaveAttribute("data-replay", "1");
  expect(screen.getByRole("button", { name: "다시보기" })).toHaveAttribute(
    "data-ph-capture-attribute-action", "landing_create_demo_replay"
  );
  fireEvent.animationEnd(container.querySelector(".lpc-timeline-sentinel"));
  act(() => intersect([{ isIntersecting: false, intersectionRatio: 0 }]));
  enter();
  expect(scene()).toHaveAttribute("data-state", "running");
  unmount();
  expect(disconnect).toHaveBeenCalled();
});

test("reduced motion exposes the complete form without autoplay or replay", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  });
  const { container } = render(<LandingCreateDemo />);
  expect(container.querySelector(".lpc-scene")).toHaveAttribute("data-state", "complete");
  expect(screen.getByRole("button", { name: "다시보기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "일시정지" })).toBeDisabled();
});

test("backgrounding the tab pauses the demo and returning resumes it", () => {
  const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
  const { container } = render(<LandingCreateDemo />);
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  try {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(container.querySelector(".lpc-scene")).toHaveAttribute("data-paused", "true");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    fireEvent(document, new Event("visibilitychange"));
    expect(container.querySelector(".lpc-scene")).toHaveAttribute("data-paused", "false");
  } finally {
    if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
    else delete document.hidden;
  }
});


test("a sticky creation scene resets when hidden and starts again when selected", () => {
  const { container, rerender } = render(<LandingCreateDemo isActive />);
  const scene = () => container.querySelector(".lpc-scene");
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  fireEvent.animationEnd(container.querySelector(".lpc-timeline-sentinel"));
  expect(scene()).toHaveAttribute("data-state", "complete");

  rerender(<LandingCreateDemo isActive={false} />);
  expect(scene()).toHaveAttribute("data-state", "idle");
  rerender(<LandingCreateDemo isActive />);
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 1 }]));
  expect(scene()).toHaveAttribute("data-state", "running");
});
