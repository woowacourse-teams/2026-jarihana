import { fireEvent, render, screen } from "@testing-library/react";
import { Board } from "./Board";
import { Stone } from "./Stone";
import { lobbyRoomSchema, newerSnapshot, roomSchema, turnMemberId } from "./api";
import { isPrivateRoute, normalizePath, maskNetworkRequest } from "../../shared/analytics/privacy";

export const snapshot = {
  id: 1,
  hostMemberId: 10,
  hostName: "호스트",
  guestMemberId: 20,
  guestName: "친구",
  visibility: "PUBLIC",
  rule: "RENJU",
  status: "PLAYING",
  hostReady: false,
  guestReady: false,
  gameNumber: 1,
  blackMemberId: 10,
  board: "0".repeat(225),
  ply: 0,
  lastX: null,
  lastY: null,
  winnerMemberId: null,
  endReason: null,
  revision: 2,
  serverNow: 1000,
  turnDeadline: 61000
};
test("lobby accepts public room summaries without participant-only game state", () => {
  const summary = {
    id: 1,
    hostMemberId: 10,
    hostName: "호스트",
    guestMemberId: 20,
    guestName: "친구",
    visibility: "PUBLIC",
    rule: "RENJU",
    status: "PLAYING"
  };
  expect(lobbyRoomSchema.safeParse(summary).success).toBe(true);
  expect(roomSchema.safeParse(summary).success).toBe(false);
});
test("older, duplicate and wrong room snapshots cannot replace current board", () => {
  expect(newerSnapshot(snapshot, { ...snapshot, revision: 1 })).toBe(snapshot);
  expect(newerSnapshot(snapshot, { ...snapshot })).toBe(snapshot);
  expect(newerSnapshot(snapshot, { ...snapshot, id: 2, revision: 9 })).toBe(snapshot);
  expect(newerSnapshot(snapshot, { ...snapshot, revision: 3 }).revision).toBe(3);
  expect(turnMemberId(snapshot)).toBe(10);
  expect(turnMemberId({ ...snapshot, ply: 1 })).toBe(20);
  expect(turnMemberId({ ...snapshot, status: "FINISHED" })).toBeNull();
  expect(roomSchema.safeParse({ ...snapshot, board: "0".repeat(224) }).success).toBe(false);
});
test("custom appearances retain BLACK/WHITE semantics and unknown appearance falls back", () => {
  const Character = ({ color }) => <span data-testid="character">{color}</span>;
  const { container, rerender } = render(
    <Stone color="WHITE" appearance="character" renderers={{ character: Character }} />
  );
  expect(screen.getByTestId("character")).toHaveTextContent("WHITE");
  expect(container.firstChild).toHaveClass("gomoku-stone--white");
  rerender(<Stone color="BLACK" appearance="missing" renderers={{ character: Character }} />);
  expect(container.firstChild).toHaveClass("gomoku-stone--black");
  expect(container.querySelector(".gomoku-stone__classic")).toBeInTheDocument();
});
test("board selection never sends a move, occupied/disconnected cells stay inert and arrows move focus", () => {
  const onSelect = jest.fn();
  const { rerender } = render(
    <Board room={snapshot} onSelect={onSelect} selected={null} disabled={false} />
  );
  const center = screen.getByRole("button", { name: "H8, 빈 자리" });
  center.focus();
  fireEvent.keyDown(center, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "I8, 빈 자리" })).toHaveFocus();
  fireEvent.click(center);
  expect(onSelect).toHaveBeenCalledWith({ x: 7, y: 7 });
  onSelect.mockClear();
  rerender(<Board room={snapshot} onSelect={onSelect} selected={null} disabled />);
  fireEvent.click(center);
  expect(onSelect).not.toHaveBeenCalled();
  rerender(
    <Board
      room={{ ...snapshot, board: "1" + "0".repeat(224) }}
      onSelect={onSelect}
      selected={null}
      disabled={false}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "A1, 흑돌" }));
  expect(onSelect).not.toHaveBeenCalled();
});
test("double-click confirms only an available empty cell and single click only selects", () => {
  const onSelect = jest.fn();
  const onConfirm = jest.fn();
  const properties = { room: snapshot, selected: null, onSelect, onConfirm };
  const { rerender } = render(<Board {...properties} disabled={false} />);
  const center = screen.getByRole("button", { name: "H8, 빈 자리" });
  fireEvent.click(center);
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.doubleClick(center);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith({ x: 7, y: 7 });
  expect(center).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_position_select");
  onConfirm.mockClear();
  rerender(<Board {...properties} disabled />);
  fireEvent.doubleClick(center);
  rerender(<Board {...properties} room={{ ...snapshot, board: "1" + "0".repeat(224) }} />);
  fireEvent.doubleClick(screen.getByRole("button", { name: "A1, 흑돌" }));
  expect(onConfirm).not.toHaveBeenCalled();
});
test("invitation tokens are excluded from analytics and network recording", () => {
  expect(isPrivateRoute("/games/gomoku/invite/secret-token")).toBe(true);
  expect(isPrivateRoute("/api/games/gomoku/invitations/secret-token")).toBe(true);
  expect(normalizePath("/games/gomoku/invite/123")).toBe("/games/gomoku/invite/:redacted");
  expect(maskNetworkRequest({ name: "/api/games/gomoku/invitations/secret-token" })).toBeNull();
  expect(isPrivateRoute("/games/gomoku/rooms/1")).toBe(false);
});

test("board forwards appearance registry while keeping rule color", () => {
  render(
    <Board
      room={{ ...snapshot, board: "1" + "0".repeat(224) }}
      selected={null}
      onSelect={() => {}}
      disabled
      appearanceByColor={{ BLACK: "character" }}
      renderers={{ character: ({ color }) => <span data-testid="board-character">{color}</span> }}
    />
  );
  expect(screen.getByTestId("board-character")).toHaveTextContent("BLACK");
  expect(screen.getByTestId("board-character").closest(".gomoku-stone")).toHaveClass(
    "gomoku-stone--black"
  );
});
