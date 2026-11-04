import { fireEvent, render } from "@testing-library/react";
import { GameArtwork } from "./GameArtwork";

const originalEnvironment = process.env.APP_DEPLOY_ENV;
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.APP_DEPLOY_ENV;
  else process.env.APP_DEPLOY_ENV = originalEnvironment;
});

test.each([
  ["development", "jarihana-dev"],
  ["production", "jarihana"]
])("%s uses its own S3 artwork prefix", (environment, prefix) => {
  process.env.APP_DEPLOY_ENV = environment;
  jest.isolateModules(() => {
    const { gameArtwork } = require("./artworkAssets");
    expect(gameArtwork.gomoku).toContain(`/${prefix}/images/games/gomoku-lounge-`);
    expect(gameArtwork.rhythm).toContain(`/${prefix}/images/games/rhythm-lounge-`);
  });
});

test("failed decorative artwork falls back without changing the frame or hiding the next game", () => {
  const { container, rerender } = render(<GameArtwork game="gomoku" priority />);
  const image = container.querySelector("img");
  expect(image).toHaveAttribute("alt", "");
  expect(image).toHaveAttribute("width", "1536");
  expect(image).toHaveAttribute("height", "1024");
  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  fireEvent.error(image);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
  rerender(<GameArtwork game="rhythm" />);
  expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("rhythm-lounge-"));
});
