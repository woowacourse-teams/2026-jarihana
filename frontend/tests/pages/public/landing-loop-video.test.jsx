import { act, render } from "@testing-library/react";

import { LandingLoopVideo } from "../../../src/pages/landing/LandingLoopVideo";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
});

test("shows the poster first and loads the muted loop only when the video comes near the screen", () => {
  const { container } = render(<LandingLoopVideo label="아지트 화면" poster="poster.webp" src="clip.mp4" />);
  const video = container.querySelector("video");
  expect(video).toHaveAttribute("poster", "poster.webp");
  expect(video).toHaveAttribute("aria-label", "아지트 화면");
  expect(video).not.toHaveAttribute("src");
  expect(video.muted).toBe(true);
  expect(video.loop).toBe(true);

  act(() => global.triggerIntersection(true));
  expect(video).toHaveAttribute("src", "clip.mp4");
  expect(video.play).toHaveBeenCalled();
});

test("hides a decorative loop from assistive technology", () => {
  const { container } = render(<LandingLoopVideo poster="poster.webp" src="clip.mp4" />);
  expect(container.querySelector("video")).toHaveAttribute("aria-hidden", "true");
});

test("keeps only the poster when reduced motion is requested", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query) => ({
      addEventListener: () => {},
      matches: query.includes("reduce"),
      media: query,
      removeEventListener: () => {}
    })
  });
  const { container } = render(<LandingLoopVideo poster="poster.webp" src="clip.mp4" />);
  act(() => global.triggerIntersection(true));
  const video = container.querySelector("video");
  expect(video).not.toHaveAttribute("src");
  expect(video).not.toHaveAttribute("autoplay");
});
