import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../shared/ui";

let hoverDismissed = false;

export function GomokuTooltip({ label, action, trigger, triggerClassName = "", panelClassName = "", children }) {
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
          className={triggerClassName}
          aria-label={label}
          aria-describedby={open ? tooltipId : undefined}
          data-ph-capture-attribute-action={action}
          onFocus={show}
          onBlur={() => {
            if (!pointerInTooltip.current) scheduleClose();
          }}
          onClick={show}
        >
          {trigger || label}
        </Button>
      </span>
      {open &&
        createPortal(
          <div
            ref={tooltip}
            id={tooltipId}
            role="tooltip"
            className={`gomoku-rule-tooltip ${panelClassName}`}
            onPointerEnter={() => {
              pointerInTooltip.current = true;
              clearTimeout(closeTimer.current);
            }}
            onPointerLeave={() => {
              pointerInTooltip.current = false;
              scheduleClose();
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
