import { useEffect, useRef } from "react";
import { WheelGestures } from "wheel-gestures";

const DESKTOP_GUIDE = "(min-width: 64rem) and (height > 55rem) and (prefers-reduced-motion: no-preference)";
const STEP_DURATION = 520;
const WHEEL_THRESHOLD = 40;
const INPUT_PAUSE = 180;
const POSITION_TOLERANCE = 80;

export function useLandingGuideScroll(sectionRef, setActiveChapter) {
  const snappingRef = useRef(false);

  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;
    const chapters = [...root.querySelectorAll("[data-guide-chapter]")];
    if (!chapters.length) return;
    const desktop = window.matchMedia(DESKTOP_GUIDE);
    let frame = null;
    const gestures = WheelGestures({ preventWheelAction: false, reverseSign: false });
    let lastWheelAt = -Infinity;
    let consumed = false;
    let distance = 0;
    let previousDelta = 0;

    function cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      snappingRef.current = false;
      consumed = false;
      distance = 0;
      lastWheelAt = -Infinity;
      previousDelta = 0;
    }

    function stops() {
      const headerHeight = document.querySelector(".landing-header")?.getBoundingClientRect().height ?? 64;
      const center = (window.innerHeight + headerHeight) / 2;
      return chapters.map((chapter) => {
        const rect = chapter.getBoundingClientRect();
        return { id: chapter.dataset.guideChapter, top: window.scrollY + rect.top + rect.height / 2 - center };
      });
    }

    function destination(direction, delta = 0) {
      const center = window.innerHeight / 2;
      const anotherSequenceInView = [...document.querySelectorAll("[data-guide-sequence]")].some((sequence) => {
        if (root.contains(sequence)) return false;
        const rect = sequence.getBoundingClientRect();
        return rect.top <= center && rect.bottom >= center;
      });
      if (anotherSequenceInView) return null;
      const positions = stops();
      const first = positions[0];
      const last = positions.at(-1);
      const y = window.scrollY;
      const margin = window.innerHeight * 0.35;
      if (y < first.top - margin || y > last.top + margin) {
        if (direction > 0 && y < first.top && y + delta >= first.top) return first;
        if (direction < 0 && y > last.top && y + delta <= last.top) return last;
        return null;
      }
      return direction > 0
        ? positions.find((position) => position.top > y + POSITION_TOLERANCE)
        : positions.findLast((position) => position.top < y - POSITION_TOLERANCE);
    }

    function settle(target) {
      const start = window.scrollY;
      const startedAt = performance.now();
      let previousY = start;
      snappingRef.current = true;
      setActiveChapter(target.id);
      function tick(now) {
        if (!desktop.matches || Math.abs(window.scrollY - previousY) > 2) {
          cancel();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / STEP_DURATION);
        const eased = progress * progress * (3 - 2 * progress);
        window.scrollTo({ top: start + (target.top - start) * eased, behavior: "instant" });
        previousY = window.scrollY;
        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          frame = null;
          snappingRef.current = false;
        }
      }
      frame = requestAnimationFrame(tick);
    }

    function onGesture({ event, axisDelta, isStart, isEnding, isMomentum }) {
      if (isEnding) return;
      const delta = axisDelta[1];
      const direction = Math.sign(delta);
      const reversed = previousDelta !== 0 && direction !== Math.sign(previousDelta) && Math.abs(delta) >= WHEEL_THRESHOLD;
      const renewed = !isMomentum && Math.abs(previousDelta) < WHEEL_THRESHOLD &&
        Math.abs(delta) >= WHEEL_THRESHOLD && Math.abs(delta) >= Math.abs(previousDelta) * 2;
      const separated = event.timeStamp - lastWheelAt >= INPUT_PAUSE && !isMomentum;
      if ((isStart && !isMomentum) || reversed || renewed || separated) {
        consumed = false;
        distance = 0;
      }
      lastWheelAt = event.timeStamp;
      previousDelta = delta;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const target = destination(direction, event.deltaY * unit);
      if (!target && frame === null && !consumed) return;
      event.preventDefault();
      if (consumed || (isMomentum && !reversed)) return;
      distance += delta;
      if (frame !== null || Math.abs(distance) < WHEEL_THRESHOLD || !target) return;
      consumed = true;
      settle(target);
    }

    const unsubscribe = gestures.on("wheel", onGesture);

    function onWheel(event) {
      if (!desktop.matches || event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      gestures.feedWheel(event);
    }

    function onKeyDown(event) {
      if (event.key === "Home" || event.key === "End") {
        cancel();
        return;
      }
      if (!desktop.matches || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest?.("a, button, input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      const direction = event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)
        ? 1 : event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey) ? -1 : 0;
      if (!direction) return;
      const target = destination(direction);
      if (!target && frame === null) return;
      event.preventDefault();
      if (event.repeat || frame !== null) return;
      consumed = false;
      settle(target);
    }

    function onClick(event) {
      if (event.target.closest?.("a[href]")) cancel();
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onClick);
    window.addEventListener("pointerdown", cancel);
    window.addEventListener("resize", cancel);
    window.addEventListener("hashchange", cancel);
    desktop.addEventListener("change", cancel);
    return () => {
      cancel();
      unsubscribe();
      gestures.disconnect();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClick);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("hashchange", cancel);
      desktop.removeEventListener("change", cancel);
    };
  }, [sectionRef, setActiveChapter]);

  return snappingRef;
}
