import { useRef, useState } from "react";
import { Stone } from "./Stone";
export function Board({
  room,
  selected,
  onSelect,
  onConfirm,
  disabled,
  readOnly = false,
  appearanceByColor = {},
  renderers
}) {
  const [focusIndex, setFocusIndex] = useState(112);
  const cells = useRef([]);
  function moveFocus(event, index) {
    const x = index % 15;
    const y = Math.floor(index / 15);
    const next = {
      ArrowLeft: y * 15 + Math.max(0, x - 1),
      ArrowRight: y * 15 + Math.min(14, x + 1),
      ArrowUp: Math.max(0, y - 1) * 15 + x,
      ArrowDown: Math.min(14, y + 1) * 15 + x
    }[event.key];
    if (next == null) return;
    event.preventDefault();
    setFocusIndex(next);
    cells.current[next]?.focus();
  }
  return (
    <div
      className="gomoku-board"
      aria-label={
        readOnly
          ? "15줄 오목판. 관전 중이며 화살표로 돌의 위치를 확인할 수 있어요."
          : "15줄 오목판. 화살표로 이동하고 Enter로 자리를 선택하세요. 더블클릭하면 바로 자리합니다."
      }
    >
      {Array.from({ length: 225 }, (_, index) => {
        const x = index % 15;
        const y = Math.floor(index / 15);
        const value = room.board[index];
        const chosen = selected?.x === x && selected?.y === y;
        return (
          <button
            type="button"
            key={index}
            ref={(node) => {
              cells.current[index] = node;
            }}
            tabIndex={focusIndex === index ? 0 : -1}
            className={`gomoku-cell${chosen ? " gomoku-cell--selected" : ""}`}
            data-ph-capture-attribute-action="gomoku_position_select"
            aria-pressed={chosen}
            aria-disabled={disabled || value !== "0"}
            aria-label={`${String.fromCharCode(65 + x)}${y + 1}, ${value === "1" ? "흑돌" : value === "2" ? "백돌" : "빈 자리"}${room.lastX === x && room.lastY === y ? ", 마지막 수" : ""}`}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event) => moveFocus(event, index)}
            onClick={() => {
              if (!readOnly && !disabled && value === "0") onSelect({ x, y });
            }}
            onDoubleClick={() => {
              if (!readOnly && !disabled && value === "0") onConfirm?.({ x, y });
            }}
          >
            {((x === 7 && y === 7) || ([3, 11].includes(x) && [3, 11].includes(y))) && (
              <span className="gomoku-star" aria-hidden="true" />
            )}
            {value !== "0" && (
              <Stone
                color={value === "1" ? "BLACK" : "WHITE"}
                appearance={appearanceByColor[value === "1" ? "BLACK" : "WHITE"]}
                renderers={renderers}
                last={room.lastX === x && room.lastY === y}
              />
            )}
            {chosen && value === "0" && <span className="gomoku-selection" />}
          </button>
        );
      })}
    </div>
  );
}
