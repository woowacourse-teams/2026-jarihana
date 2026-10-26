import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_LIST_WIDTH = "20rem";
const DEFAULT_MIN_WIDTH = "240px";
const DEFAULT_MAX_WIDTH = "440px";
const DEFAULT_CONVERSATION_MIN_WIDTH = "360px";
const KEYBOARD_STEP = 16;

function pxFromCssLength(value, element) {
  const normalized = value?.trim();
  if (!normalized) return 0;

  const numeric = Number.parseFloat(normalized);
  if (Number.isNaN(numeric)) return 0;

  if (normalized.endsWith("rem")) {
    const rootFontSize =
      typeof document === "undefined" || typeof getComputedStyle === "undefined"
        ? 16
        : Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return numeric * (rootFontSize || 16);
  }

  if (normalized.endsWith("em")) {
    const elementFontSize =
      !element || typeof getComputedStyle === "undefined"
        ? 16
        : Number.parseFloat(getComputedStyle(element).fontSize);
    return numeric * (elementFontSize || 16);
  }

  return numeric;
}

function readCssLength(element, propertyName, fallback) {
  if (!element || typeof getComputedStyle === "undefined") {
    return pxFromCssLength(fallback, element);
  }

  const styles = getComputedStyle(element);
  return pxFromCssLength(styles.getPropertyValue(propertyName) || fallback, element);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSidebar(layout) {
  return layout?.querySelector("aside.chat-sidebar#chat-sidebar") ?? null;
}

function getSidebarWidth(sidebar) {
  return sidebar?.getBoundingClientRect().width ?? 0;
}

function initialMetrics() {
  return {
    min: pxFromCssLength(DEFAULT_MIN_WIDTH),
    max: pxFromCssLength(DEFAULT_MAX_WIDTH),
    width: pxFromCssLength(DEFAULT_LIST_WIDTH)
  };
}

function sameMetrics(a, b) {
  return a.min === b.min && a.max === b.max && a.width === b.width;
}

export function ChatSidebarResizer({ layoutRef, onResize }) {
  const dragRef = useRef(null);
  const [isResizing, setIsResizing] = useState(false);
  const [metrics, setMetrics] = useState(initialMetrics);

  const getLayout = useCallback(() => layoutRef?.current ?? null, [layoutRef]);

  const readBounds = useCallback(() => {
    const layout = getLayout();
    if (!layout) {
      const defaults = initialMetrics();
      return { min: defaults.min, max: defaults.max };
    }

    const minToken = readCssLength(layout, "--chat-list-min-width", DEFAULT_MIN_WIDTH);
    const maxToken = readCssLength(layout, "--chat-list-max-width", DEFAULT_MAX_WIDTH);
    const conversationMin = readCssLength(
      layout,
      "--chat-conversation-min-width",
      DEFAULT_CONVERSATION_MIN_WIDTH
    );
    const layoutWidth = layout.clientWidth;
    const maxByLayout = layoutWidth > 0 ? layoutWidth - conversationMin : maxToken;
    const max = Math.max(0, Math.min(maxToken, maxByLayout));
    const min = Math.min(minToken, max);

    return { min, max };
  }, [getLayout]);

  const syncMetrics = useCallback(() => {
    const layout = getLayout();
    const sidebar = getSidebar(layout);
    const bounds = readBounds();
    const measuredWidth = getSidebarWidth(sidebar);

    setMetrics((current) => {
      const width =
        measuredWidth > 0 ? measuredWidth : clamp(current.width, bounds.min, bounds.max);
      const next = { ...bounds, width };
      return sameMetrics(current, next) ? current : next;
    });
  }, [getLayout, readBounds]);

  const resizeTo = useCallback(
    (nextWidth) => {
      const bounds = readBounds();
      const width = clamp(nextWidth, bounds.min, bounds.max);
      onResize(width);
      setMetrics({ ...bounds, width });
    },
    [onResize, readBounds]
  );

  const stopResize = useCallback(() => {
    dragRef.current = null;
    setIsResizing(false);
    syncMetrics();
  }, [syncMetrics]);

  function handlePointerDown(event) {
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;

    const layout = getLayout();
    const sidebar = getSidebar(layout);
    if (!layout || !sidebar) return;

    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: getSidebarWidth(sidebar)
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsResizing(true);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    resizeTo(drag.startWidth + event.clientX - drag.startClientX);
  }

  function handlePointerRelease(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopResize();
  }

  function handleKeyDown(event) {
    const layout = getLayout();
    const sidebar = getSidebar(layout);
    const bounds = readBounds();
    const currentWidth =
      getSidebarWidth(sidebar) || clamp(metrics.width, bounds.min, bounds.max);

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeTo(currentWidth - KEYBOARD_STEP);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeTo(currentWidth + KEYBOARD_STEP);
    }
    if (event.key === "Home") {
      event.preventDefault();
      resizeTo(bounds.min);
    }
    if (event.key === "End") {
      event.preventDefault();
      resizeTo(bounds.max);
    }
  }

  function handleDoubleClick() {
    const layout = getLayout();
    if (!layout) return;

    resizeTo(readCssLength(layout, "--chat-list-width", DEFAULT_LIST_WIDTH));
  }

  useEffect(() => {
    const layout = getLayout();
    const sidebar = getSidebar(layout);

    if (!layout || !sidebar || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(syncMetrics);
    observer.observe(layout);
    observer.observe(sidebar);

    return () => observer.disconnect();
  }, [getLayout, syncMetrics]);

  const valueNow = Math.round(metrics.width);
  const valueMin = Math.round(metrics.min);
  const valueMax = Math.round(metrics.max);

  return (
    <div
      role="slider"
      aria-orientation="horizontal"
      aria-controls="chat-sidebar"
      aria-label="채팅 목록 너비 조절"
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      aria-valuetext={`${valueNow}px`}
      className="chat-sidebar-resizer"
      data-ph-capture-attribute-action="chat_sidebar_resize"
      data-resizing={isResizing ? "true" : "false"}
      tabIndex={0}
      title="드래그 또는 방향키로 너비 조절 · 더블클릭으로 초기화"
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={stopResize}
      onPointerCancel={handlePointerRelease}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
    />
  );
}
