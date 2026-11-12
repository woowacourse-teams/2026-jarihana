import { act, render, waitFor } from "@testing-library/react";

import { LandingClubhouseScene } from "../../../src/pages/landing/LandingClubhouseScene";
import { createRoomScene } from "../../../src/pages/space/roomScene";

jest.mock("../../../src/pages/space/roomScene", () => ({ createRoomScene: jest.fn() }));
jest.mock("../../../src/pages/space/roomState", () => ({ createInitialRoom: () => ({ id: "lounge" }) }));

const ROOM = { id: "lounge" };
const originalMatchMedia = window.matchMedia;
let frames;

function setReducedMotion(matches) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn().mockReturnValue({ matches })
  });
}

function runtime() {
  return { command: jest.fn(), dispose: jest.fn(), orbitBy: jest.fn(), update: jest.fn() };
}

function sceneOf(container) {
  return container.querySelector(".landing-clubhouse-scene");
}

function runFrame(time) {
  const callback = frames.shift();
  act(() => callback(time));
}

async function renderReady(room, mode = "orbit") {
  createRoomScene.mockReturnValue(room);
  const result = render(<LandingClubhouseScene mode={mode} poster="poster.webp" />);
  act(() => global.triggerIntersection(true));
  await waitFor(() => expect(sceneOf(result.container)).toHaveAttribute("data-scene-status", "ready"));
  return result;
}

function recordKeys(container) {
  const keys = [];
  const host = container.querySelector(".landing-clubhouse-scene__canvas");
  host.addEventListener("keydown", (event) => keys.push(`down:${event.code}`));
  host.addEventListener("keyup", (event) => keys.push(`up:${event.code}`));
  return keys;
}

beforeEach(() => {
  jest.clearAllMocks();
  frames = [];
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 600, height: 600, left: 0, right: 800, top: 0, width: 800, x: 0, y: 0
  });
  setReducedMotion(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
});

test("shows the recorded image and loads the read-only 3D clubhouse only once it is on screen", async () => {
  const room = runtime();
  createRoomScene.mockReturnValue(room);
  const { container } = render(<LandingClubhouseScene poster="poster.webp" />);

  expect(container.querySelector("img")).toHaveAttribute("src", "poster.webp");
  expect(createRoomScene).not.toHaveBeenCalled();

  act(() => global.triggerIntersection(true));

  await waitFor(() => expect(sceneOf(container)).toHaveAttribute("data-scene-status", "ready"));
  const callbacks = createRoomScene.mock.calls[0][1];
  expect(callbacks.canInteract()).toBe(false);
  expect(callbacks.canEdit()).toBe(false);
  expect(room.update).toHaveBeenCalledWith(ROOM, null, "perspective", expect.any(Number), "all", 0);
});

test("slowly orbits the camera while visible and stops when it leaves the screen", async () => {
  const room = runtime();
  const { unmount } = await renderReady(room);

  runFrame(0);
  runFrame(50);
  expect(room.orbitBy).toHaveBeenCalledTimes(1);
  expect(room.orbitBy.mock.calls[0][0]).toBeCloseTo(-0.004);

  act(() => global.triggerIntersection(false));
  expect(window.cancelAnimationFrame).toHaveBeenCalled();
  unmount();
  expect(room.dispose).toHaveBeenCalledTimes(1);
});

test("flies into a third-person walk from the door and back to the orbit when the curtain returns", async () => {
  const room = runtime();
  const { container, rerender } = await renderReady(room);
  const keys = recordKeys(container);
  jest.useFakeTimers();

  rerender(<LandingClubhouseScene mode="walk" poster="poster.webp" />);
  const callbacks = createRoomScene.mock.calls[0][1];
  expect(callbacks.canInteract()).toBe(true);
  const flight = room.update.mock.calls.at(-1)[6];
  expect(room.update).toHaveBeenLastCalledWith(ROOM, null, "thirdPerson", expect.any(Number), "all", 0, flight);
  expect(flight).toMatchObject({ duration: 900 });

  act(() => {
    flight.finish();
    jest.advanceTimersByTime(0);
  });
  expect(room.update).toHaveBeenLastCalledWith(ROOM, null, "thirdPerson", expect.any(Number), "all", 0);

  act(() => jest.advanceTimersByTime(1400));
  expect(keys).toEqual(["down:KeyW"]);
  act(() => jest.advanceTimersByTime(3200 + 900));
  expect(keys).toEqual(["down:KeyW", "up:KeyW", "down:ArrowLeft"]);
  act(() => jest.advanceTimersByTime(700 + 2200));
  expect(keys).toEqual(["down:KeyW", "up:KeyW", "down:ArrowLeft", "up:ArrowLeft"]);
  expect(room.command).toHaveBeenCalledWith("reset");

  rerender(<LandingClubhouseScene mode="orbit" poster="poster.webp" />);
  expect(callbacks.canInteract()).toBe(false);
  expect(room.update.mock.calls.at(-1)[2]).toBe("perspective");
  expect(room.update.mock.calls.at(-1)[6]).toMatchObject({ duration: 900 });
});

test("keeps the camera and the character still when the visitor prefers reduced motion", async () => {
  setReducedMotion(true);
  const room = runtime();
  const { container, rerender } = await renderReady(room);
  const keys = recordKeys(container);
  jest.useFakeTimers();

  rerender(<LandingClubhouseScene mode="walk" poster="poster.webp" />);
  act(() => jest.advanceTimersByTime(10000));

  expect(frames).toHaveLength(0);
  expect(room.orbitBy).not.toHaveBeenCalled();
  expect(keys).toEqual([]);
  expect(room.update).toHaveBeenLastCalledWith(ROOM, null, "thirdPerson", expect.any(Number), "all", 0);
});

test("keeps the recorded image when the browser cannot draw the 3D scene", async () => {
  createRoomScene.mockImplementation(() => {
    throw new Error("WebGL unavailable");
  });
  const { container } = render(<LandingClubhouseScene poster="poster.webp" />);
  act(() => global.triggerIntersection(true));

  await waitFor(() => expect(sceneOf(container)).toHaveAttribute("data-scene-status", "error"));
  expect(container.querySelector("img")).toHaveAttribute("src", "poster.webp");
});
