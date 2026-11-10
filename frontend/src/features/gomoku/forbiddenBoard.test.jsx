import { fireEvent, render, screen } from "@testing-library/react";
import { Board } from "./Board";
import { findForbiddenMoves } from "./forbiddenMoves";

const cells = Array(225).fill("0");
[[6,7],[8,7],[7,6],[7,8]].forEach(([x,y]) => { cells[y*15+x] = "1"; });
const room = { board: cells.join("") };

test("red rings expose the reason, preserve keyboard focus and block selection and confirmation", () => {
  const onSelect = jest.fn();
  const onConfirm = jest.fn();
  const { container, rerender } = render(<Board room={room} selected={{ x:7, y:7 }} forbiddenMoves={findForbiddenMoves(room.board)} onSelect={onSelect} onConfirm={onConfirm} />);
  const forbidden = screen.getByRole("button", { name: "H8, 빈 자리, 쌍3 금수" });
  expect(forbidden).toHaveAttribute("aria-disabled", "true");
  expect(forbidden).toHaveAttribute("aria-pressed", "false");
  expect(forbidden).toHaveAttribute("title", "쌍3 금수");
  expect(forbidden).toHaveAttribute("data-ph-capture-attribute-action", "gomoku_position_select");
  expect(forbidden.querySelector(".gomoku-forbidden")).toBeInTheDocument();
  fireEvent.click(forbidden);
  fireEvent.doubleClick(forbidden);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: "G8, 흑돌" }), { key:"ArrowRight" });
  expect(forbidden).toHaveFocus();
  rerender(<Board room={room} onSelect={onSelect} onConfirm={onConfirm} />);
  expect(container.querySelector(".gomoku-forbidden")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"H8, 빈 자리" }));
  expect(onSelect).toHaveBeenCalledWith({ x:7, y:7 });
});
