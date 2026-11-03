import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../shared/ui";

const examples = {
  three: {
    title: "3-3 예시",
    action: "gomoku_double_three_example_open",
    alt: "가운데 민트 테두리 흑돌을 놓으면 가로와 세로에 양쪽이 열린 3개짜리 줄이 동시에 생기는 3-3 예시",
    caption: "가로 3개와 세로 3개가 동시에 생겨요."
  },
  four: {
    title: "4-4 예시",
    action: "gomoku_double_four_example_open",
    alt: "가운데 민트 테두리 흑돌을 놓으면 가로와 세로에 한 돌만 더 놓으면 5개가 되는 줄이 동시에 생기는 4-4 예시",
    caption: "가로 4개와 세로 4개가 동시에 생겨요."
  }
};

let hoverDismissed = false;

export function RuleExampleTooltip({ kind, imageUrl }) {
  const example = examples[kind];
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const tooltip = useRef(null);
  const closeTimer = useRef(null);
  const pointerInTooltip = useRef(false);

  function show() {
    pointerInTooltip.current = false;
    clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function scheduleClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }
  useEffect(() => {
    hoverDismissed = false;
    function allowHover() {
      hoverDismissed = false;
    }
    document.addEventListener("pointermove", allowHover);
    return () => {
      clearTimeout(closeTimer.current);
      document.removeEventListener("pointermove", allowHover);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const trigger = anchor.current.getBoundingClientRect();
      const panel = tooltip.current.getBoundingClientRect();
      const gutter = 12;
      const left = Math.max(
        gutter,
        Math.min(trigger.left, window.innerWidth - panel.width - gutter)
      );
      const belowSpace = window.innerHeight - trigger.bottom - gutter * 2;
      const aboveSpace = trigger.top - gutter * 2;
      const below = panel.height <= belowSpace || belowSpace >= aboveSpace;
      tooltip.current.style.maxHeight = `${Math.max(0, below ? belowSpace : aboveSpace)}px`;
      const height = tooltip.current.getBoundingClientRect().height;
      const top = below ? trigger.bottom + gutter : Math.max(gutter, trigger.top - height - gutter);
      tooltip.current.style.left = `${left}px`;
      tooltip.current.style.top = `${top}px`;
      tooltip.current.style.visibility = "visible";
    }
    position();
    const frame = requestAnimationFrame(position);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function close() {
      clearTimeout(closeTimer.current);
      setOpen(false);
    }
    function outside(event) {
      if (!anchor.current?.contains(event.target) && !tooltip.current?.contains(event.target))
        close();
    }
    function keydown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      hoverDismissed = true;
      close();
    }
    function scroll(event) {
      if (!tooltip.current?.contains(event.target)) close();
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <span
        ref={anchor}
        className="gomoku-example-anchor"
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch" && !hoverDismissed) show();
        }}
        onPointerLeave={() => {
          if (
            document.activeElement === anchor.current?.querySelector("button") &&
            document.activeElement.matches(":focus-visible")
          )
            return;
          scheduleClose();
        }}
      >
        <Button
          variant="tertiary"
          size="sm"
          className="gomoku-example-trigger"
          aria-describedby={open ? tooltipId : undefined}
          data-ph-capture-attribute-action={example.action}
          onFocus={show}
          onBlur={() => {
            if (!pointerInTooltip.current) scheduleClose();
          }}
          onClick={show}
        >
          {example.title} 보기
        </Button>
      </span>
      {open &&
        createPortal(
          <div
            ref={tooltip}
            id={tooltipId}
            role="tooltip"
            className="gomoku-rule-tooltip"
            onPointerEnter={() => {
              pointerInTooltip.current = true;
              clearTimeout(closeTimer.current);
            }}
            onPointerLeave={() => {
              pointerInTooltip.current = false;
              scheduleClose();
            }}
          >
            <strong>{example.title}</strong>
            <img src={imageUrl} width="512" height="512" alt={example.alt} />
            <span>{example.caption}</span>
            <span className="gomoku-rule-tooltip__legend">민트 고리: 새 돌 / 빈 원: 빈 자리</span>
          </div>,
          document.body
        )}
    </>
  );
}
