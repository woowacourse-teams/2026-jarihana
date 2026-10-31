import { act, fireEvent, render, screen } from "@testing-library/react";

import { LandingProductDemo } from "../../../src/pages/landing/LandingProductDemo";
import { LandingProductScene } from "../../../src/pages/landing/LandingProductScene";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>{children}</a>
  )
}));

let intersect;
let originalObserver;
let originalMatchMedia;

beforeEach(() => {
  originalObserver = global.IntersectionObserver;
  originalMatchMedia = window.matchMedia;
  global.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  global.IntersectionObserver = originalObserver;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
});

const enter = () => act(() => intersect([{ isIntersecting: true }]));
const exit = () => act(() => intersect([{ isIntersecting: false }]));

function Demo({ active = true, kind = "activity" }) {
  return <LandingProductDemo screen={kind} label="서비스 이용 예시" isActive={active}>
    <div aria-hidden="true">예시 화면</div>
  </LandingProductDemo>;
}

test("a barely visible frame waits until enough of the demo enters the viewport", () => {
  const { container } = render(<Demo />);
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.1 }]));
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "idle");
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.4 }]));
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "running");
});

test("sticky scenes restart after changing chapters and leaving the viewport", () => {
  const { container, rerender } = render(<Demo active={false} />);
  const demo = () => container.querySelector(".landing-product-demo");
  enter();
  expect(demo()).toHaveAttribute("data-state", "idle");
  rerender(<Demo />);
  enter();
  expect(demo()).toHaveAttribute("data-state", "running");
  expect(demo()).toHaveAttribute("data-paused", "false");
  exit();
  expect(demo()).toHaveAttribute("data-state", "idle");
  enter();
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  rerender(<Demo active={false} />);
  fireEvent.animationEnd(container.querySelector(".landing-product-demo__timeline"));
  expect(demo()).toHaveAttribute("data-state", "idle");
  rerender(<Demo />);
  enter();
  expect(demo()).toHaveAttribute("data-state", "running");
  expect(demo()).toHaveAttribute("data-paused", "false");
});

test("completed scenes reset only after a full exit and wait for sufficient reentry", () => {
  const { container } = render(<Demo />);
  const demo = () => container.querySelector(".landing-product-demo");
  enter();
  fireEvent.animationEnd(container.querySelector(".landing-product-demo__timeline"));
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.1 }]));
  expect(demo()).toHaveAttribute("data-state", "complete");
  exit();
  expect(demo()).toHaveAttribute("data-state", "idle");
  act(() => intersect([{ isIntersecting: true, intersectionRatio: 0.1 }]));
  expect(demo()).toHaveAttribute("data-state", "idle");
  enter();
  expect(demo()).toHaveAttribute("data-state", "running");
  expect(screen.getByRole("button", { name: "일시정지" })).toBeEnabled();
});

test("completion holds the final scene and replay remounts the whole sequence", () => {
  const { container } = render(<Demo />);
  enter();
  const oldScene = screen.getByRole("img");
  expect(oldScene.querySelector("button, input, textarea, select")).toBeNull();
  fireEvent.animationEnd(container.querySelector(".landing-product-demo__timeline"));
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "complete");
  expect(screen.getByRole("button", { name: "일시정지" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다시보기" }));
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-replay", "1");
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "running");
  expect(screen.getByRole("img")).not.toBe(oldScene);
});

test.each(["browse", "detail", "continue", "proposal", "manage", "invite", "chat", "calendar", "activity", "sparring"])("%s controls retain fixed analytics actions", (kind) => {
  render(<Demo kind={kind} />);
  expect(screen.getByRole("button", { name: "다시보기" })).toHaveAttribute(
    "data-ph-capture-attribute-action", `landing_${kind}_demo_replay`
  );
  expect(screen.getByRole("button", { name: "일시정지" })).toHaveAttribute(
    "data-ph-capture-attribute-action", `landing_${kind}_demo_pause_toggle`
  );
});

function SparringDemo({ active = true }) {
  return <LandingProductDemo screen="sparring" label="토론해요 이용 예시" isActive={active}>
    <LandingProductScene screen="sparring" />
  </LandingProductDemo>;
}

test("the sparring recording follows demo start, pause, completion and reset", () => {
  const { play, pause } = window.HTMLMediaElement.prototype;
  play.mockClear();
  const { container } = render(<SparringDemo />);
  const video = () => container.querySelector("video");
  expect(play).not.toHaveBeenCalled();

  enter();
  expect(play).toHaveBeenCalledTimes(1);
  pause.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  expect(pause).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "재생" }));
  expect(play).toHaveBeenCalledTimes(2);

  fireEvent.animationEnd(container.querySelector(".landing-product-demo__timeline"));
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "complete");
  expect(play).toHaveBeenCalledTimes(2);

  video().currentTime = 9;
  exit();
  expect(video().currentTime).toBe(0);
  enter();
  expect(play).toHaveBeenCalledTimes(3);

  const previous = video();
  fireEvent.click(screen.getByRole("button", { name: "다시보기" }));
  expect(video()).not.toBe(previous);
  expect(play).toHaveBeenCalledTimes(4);
});

test("reduced motion shows the final arena still instead of the sparring recording", () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    matches: true, addEventListener() {}, removeEventListener() {}
  }) });
  const { container } = render(<SparringDemo />);
  expect(container.querySelector("video")).toBeNull();
  expect(container.querySelector("img.lps-sparring-video")).toHaveAttribute("alt", "");
});

test("reduced motion renders a completed scene with playback disabled", () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    matches: true, addEventListener() {}, removeEventListener() {}
  }) });
  const { container } = render(<Demo />);
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "complete");
  expect(screen.getByRole("button", { name: "다시보기" })).toBeDisabled();
});

test("without IntersectionObserver activating a scene still starts playback", () => {
  global.IntersectionObserver = undefined;
  const { container, rerender } = render(<Demo active={false} />);
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "idle");
  rerender(<Demo />);
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "running");
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-paused", "false");
  fireEvent.animationEnd(container.querySelector(".landing-product-demo__timeline"));
  rerender(<Demo active={false} />);
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "idle");
  rerender(<Demo />);
  expect(container.querySelector(".landing-product-demo")).toHaveAttribute("data-state", "running");
});
