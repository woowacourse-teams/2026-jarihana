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

const emptyGame = { ...playing, board: "0".repeat(225), lastX: null, lastY: null };
function move(room, x, y, extras = {}) {
  const cells = [...room.board];
  cells[y * 15 + x] = room.ply % 2 === 0 ? "1" : "2";
  return { ...room, board: cells.join(""), ply: room.ply + 1, revision: room.revision + 1,
    lastX: x, lastY: y, ...extras };
}

test("both confirmed player colors sound once even if REST and SSE repeat the move", () => {
  const { rerender } = renderHook(({ room }) => useGomokuSounds(room), { initialProps: { room: emptyGame } });
  rerender({ room: { ...emptyGame, revision: 3 } });
  expect(player.play).not.toHaveBeenCalled();
  const black = move(emptyGame, 7, 7, { revision: 4 });
  rerender({ room: black });
  rerender({ room: { ...black } });
  rerender({ room: emptyGame });
  const white = move(black, 8, 7);
  rerender({ room: white });
  expect(player.play.mock.calls).toEqual([["stone"], ["stone"]]);
});

test.each(["FIVE", "DRAW"])("a final %s move sounds but resigning does not", (endReason) => {
  const { rerender } = renderHook(({ room }) => useGomokuSounds(room), { initialProps: { room: emptyGame } });
  rerender({ room: move(emptyGame, 7, 7, { status: "FINISHED", endReason }) });
  expect(player.play.mock.calls).toEqual([["stone"]]);
  rerender({ room: { ...emptyGame, gameNumber: 2, revision: 4 } });
  player.play.mockClear();
  rerender({ room: { ...emptyGame, gameNumber: 2, revision: 5, status: "FINISHED", endReason: "RESIGN" } });
  expect(player.play).not.toHaveBeenCalled();
});

test("initial history, missed moves, a rematch and invalid board changes never replay stones", () => {
  const historical = move(move(emptyGame, 7, 7), 8, 7);
  const { rerender } = renderHook(({ room }) => useGomokuSounds(room), { initialProps: { room: historical } });
  const catchUp = move(move(historical, 6, 7), 9, 7);
  rerender({ room: catchUp });
  rerender({ room: { ...emptyGame, gameNumber: 2, revision: 10 } });
  rerender({ room: { ...emptyGame, gameNumber: 2, revision: 11, ply: 1, lastX: 7, lastY: 7 } });
  expect(player.play).not.toHaveBeenCalled();
});
