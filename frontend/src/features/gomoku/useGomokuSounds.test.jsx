import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { createGomokuAudio } from "./audio";
import { useGomokuSounds } from "./useGomokuSounds";

jest.mock("./audio", () => ({ createGomokuAudio: jest.fn() }));
const waiting = { id: 1, revision: 1, gameNumber: 0, status: "WAITING", ply: 0 };
const playing = { ...waiting, revision: 2, gameNumber: 1, status: "PLAYING" };
let player;
beforeEach(() => {
  player = { play: jest.fn(), dispose: jest.fn() };
  createGomokuAudio.mockReturnValue(player);
});
afterEach(() => jest.clearAllMocks());

test("confirmed start plays once, including duplicate and stale snapshots in StrictMode", () => {
  const { rerender } = renderHook(({ room }) => useGomokuSounds(room), {
    initialProps: { room: waiting }, wrapper: StrictMode
  });
  expect(player.play).not.toHaveBeenCalled();
  rerender({ room: playing });
  rerender({ room: { ...playing } });
  rerender({ room: waiting });
  rerender({ room: { ...playing, revision: 3 } });
  expect(player.play.mock.calls).toEqual([["start"]]);
});

test("a rejected start or ready toggle makes no sound; a confirmed rematch does", () => {
  const { rerender } = renderHook(({ room }) => useGomokuSounds(room), { initialProps: { room: waiting } });
  rerender({ room: { ...waiting, revision: 2, hostReady: true } });
  expect(player.play).not.toHaveBeenCalled();
  rerender({ room: { ...playing, status: "FINISHED", revision: 8, ply: 20 } });
  rerender({ room: { ...playing, gameNumber: 2, revision: 9 } });
  expect(player.play.mock.calls).toEqual([["start"]]);
});

test("joining an ongoing game, room changes and recovery after moves stay silent", () => {
  const { rerender, unmount } = renderHook(({ room }) => useGomokuSounds(room), { initialProps: { room: null } });
  rerender({ room: playing });
  rerender({ room: { ...playing, id: 2 } });
  rerender({ room: waiting });
  rerender({ room: { ...playing, ply: 4 } });
  expect(player.play).not.toHaveBeenCalled();
  unmount();
  expect(player.dispose).toHaveBeenCalled();
});
