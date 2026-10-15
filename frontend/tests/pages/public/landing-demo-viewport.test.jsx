import { useRef } from "react";
import { act, render } from "@testing-library/react";

import { useLandingDemoViewport } from "../../../src/pages/landing/useLandingDemoViewport";

let animations;
let media;
let resize;
let disconnect;
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;
const originalResizeObserver = global.ResizeObserver;

beforeEach(() => {
  animations = [];
  media = { matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => media) });
  disconnect = jest.fn();
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnect(); }
  };
  Element.prototype.animate = jest.fn((frames, options) => {
    const animation = {
      frames, options, currentTime: 0, playState: "paused",
      cancel: jest.fn(),
      pause: jest.fn(function () { this.playState = "paused"; }),
      play: jest.fn(function () { this.playState = "running"; }),
      finish: jest.fn(function () { this.currentTime = options.duration; this.playState = "finished"; })
    };
    animations.push(animation);
    return animation;
  });
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  global.ResizeObserver = originalResizeObserver;
});

function Demo({ state = "running", paused = false, replayKey = 0, dialogHeight = 0 }) {
  const rootRef = useRef(null);
  useLandingDemoViewport({ rootRef, screen: "detail", state, paused, replayKey });
  return <div ref={rootRef} style={{ "--demo-duration": "6s", "--landing-demo-speed": "1.5" }}>
    <div className="landing-guide-frame__screen" ref={(node) => {
      if (node) Object.defineProperty(node, "clientHeight", { configurable: true, value: 400 });
    }}>
      <div className="landing-product-scene" style={{ paddingTop: 16 }} ref={(node) => {
        if (node) Object.defineProperty(node, "offsetHeight", { configurable: true, value: 900 });
      }}><div className="lps-application-overlay" style={{ padding: 12 }}>
        {dialogHeight > 0 && <div className="lps-application" ref={(node) => {
          if (node) Object.defineProperty(node, "offsetHeight", { configurable: true, value: dialogHeight });
        }} />}
      </div></div>
    </div>
  </div>;
}

test("panning reveals the bottom without moving the dialog out of the viewport", () => {
  render(<Demo />);
  expect(animations).toHaveLength(2);
  expect(animations[0].frames.at(-1).translate).toBe("0 -500px");
  expect(animations[1].frames.at(-1).translate).toBe("0 500px");
  expect(animations[0].options.duration).toBe(4000);
  expect(animations.every((animation) => animation.playState === "running")).toBe(true);
});

test("pause, completion, replay and exiting control the same camera timeline", () => {
  const { rerender, unmount } = render(<Demo />);
  animations[0].currentTime = 1200;
  rerender(<Demo paused />);
  expect(animations[0].playState).toBe("paused");
  expect(animations[0].currentTime).toBe(1200);
  rerender(<Demo />);
  expect(animations[0].playState).toBe("running");
  rerender(<Demo state="complete" />);
  expect(animations[0].currentTime).toBe(4000);
  rerender(<Demo replayKey={1} />);
  expect(animations[0].cancel).toHaveBeenCalled();
  expect(animations.at(-2).currentTime).toBe(0);
  expect(animations.at(-2).playState).toBe("running");
  rerender(<Demo replayKey={1} state="idle" />);
  expect(animations.at(-2).playState).toBe("paused");
  expect(animations.at(-2).currentTime).toBe(0);
  unmount();
  expect(disconnect).toHaveBeenCalled();
  expect(animations.at(-2).cancel).toHaveBeenCalled();
});

test("an oversized dialog reveals its action within the same window", () => {
  render(<Demo dialogHeight={460} />);
  expect(animations).toHaveLength(3);
  expect(animations[2].frames[1]).toMatchObject({ offset: 0.28, translate: "0 0px" });
  expect(animations[2].frames.at(-1).translate).toBe("0 -84px");
  expect(animations[2].options.duration).toBe(4000);
});

test("resizing preserves elapsed time and leaving mobile motion cancels the camera", () => {
  render(<Demo />);
  animations[0].currentTime = 1800;
  act(() => resize());
  expect(animations.at(-2).currentTime).toBe(1800);
  expect(animations[0].cancel).toHaveBeenCalled();
  media.matches = false;
  act(() => media.addEventListener.mock.calls[0][1]());
  expect(animations.at(-2).cancel).toHaveBeenCalled();
});

test("desktop or reduced motion keeps the complete document layout without panning", () => {
  media.matches = false;
  render(<Demo state="complete" />);
  expect(animations).toHaveLength(0);
});
