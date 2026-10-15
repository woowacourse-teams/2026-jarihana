import { useEffect } from "react";
import { WheelGestures } from "wheel-gestures";

// Centers of the reading intervals in landing.css; the last stop is the chair invitation.
const STOPS = [0, 0.26, 0.44, 0.62, 0.9];
const QUESTION_DURATION = 520;
const CHAIR_REVEAL_DURATION = 1100;
const WHEEL_THRESHOLD = 40;
const INPUT_PAUSE = 180;
const POSITION_TOLERANCE = 2;

export function useLandingQuestionScroll(heroRef) {
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !window.CSS?.supports?.("animation-timeline: view()")) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const gestures = WheelGestures({ preventWheelAction: false, reverseSign: false });
    let wheelMoved = false;
    let wheelCaptured = false;
    let wheelDistance = 0;
    let wheelDirection = 0;
    let lastWheelAt = -Infinity;
    let touch = null;
    let animationFrame = null;

    function stopTransition() {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      wheelCaptured = false;
      wheelMoved = false;
    }

    function transitionTo(target, duration) {
      const start = window.scrollY;
      const startedAt = performance.now();
      let previousY = start;
      function tick(now) {
        if (reducedMotion.matches || Math.abs(window.scrollY - previousY) > 2) {
          stopTransition();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        window.scrollTo({ top: start + (target - start) * eased, behavior: "instant" });
        previousY = window.scrollY;
        if (progress < 1) {
          animationFrame = requestAnimationFrame(tick);
        } else {
          animationFrame = null;
        }
      }
      animationFrame = requestAnimationFrame(tick);
    }

    function position() {
      const rect = hero.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      const top = rect.top + window.scrollY;
      const about = hero.nextElementSibling;
      const aboutRect = about?.matches('[data-guide-chapter="about"]') ? about.getBoundingClientRect() : null;
      const headerHeight = document.querySelector(".landing-header")?.getBoundingClientRect().height ?? 64;
      const aboutTop = aboutRect
        ? window.scrollY + aboutRect.top + aboutRect.height / 2 - (window.innerHeight + headerHeight) / 2
        : null;
      return { top, distance, progress: (window.scrollY - top) / distance, aboutTop };
    }

    function canStep(direction) {
      if (reducedMotion.matches) return false;
      const { top, distance, progress, aboutTop } = position();
      const end = aboutTop ?? top + distance;
      if (distance <= 0 || window.scrollY < Math.max(0, top - 80) || window.scrollY > end + POSITION_TOLERANCE) return false;
      if (animationFrame !== null) return true;
      if (aboutTop !== null) return direction > 0 ? window.scrollY < aboutTop - POSITION_TOLERANCE : progress > 0.01;
      return direction > 0 ? progress < 0.73 : progress > 0.01;
    }

    function step(direction) {
      if (animationFrame !== null) return;
      const { top, distance, progress, aboutTop } = position();
      const chairTop = top + distance * STOPS.at(-1);
      if (aboutTop !== null && direction > 0 && window.scrollY >= chairTop - POSITION_TOLERANCE) {
        transitionTo(aboutTop, QUESTION_DURATION);
        return;
      }
      if (aboutTop !== null && direction < 0 && window.scrollY > chairTop + POSITION_TOLERANCE) {
        transitionTo(chairTop, QUESTION_DURATION);
        return;
      }
      const current = STOPS.reduce(
        (nearest, stop, index) =>
          Math.abs(stop - progress) < Math.abs(STOPS[nearest] - progress) ? index : nearest,
        0
      );
      const next = Math.max(0, Math.min(STOPS.length - 1, current + direction));
      transitionTo(
        top + distance * STOPS[next],
        direction > 0 && next === STOPS.length - 1 ? CHAIR_REVEAL_DURATION : QUESTION_DURATION
      );
    }

    function onGesture({ event, axisDelta, isStart, isEnding, isMomentum }) {
      if (isEnding) return;
      const delta = axisDelta[1];
      const direction = Math.sign(delta);
      const reversed = wheelDirection !== 0 && direction !== wheelDirection &&
        Math.abs(delta) >= WHEEL_THRESHOLD;
      const separated = event.timeStamp - lastWheelAt >= INPUT_PAUSE && !isMomentum;
      lastWheelAt = event.timeStamp;
      if ((isStart && !isMomentum) || reversed || separated) {
        wheelMoved = false;
        wheelCaptured = false;
        wheelDistance = 0;
      }
      wheelDirection = direction;
      const { top, distance, progress, aboutTop } = position();
      if (reducedMotion.matches || window.scrollY > (aboutTop ?? top + distance) + POSITION_TOLERANCE || progress < -0.04) {
        wheelCaptured = false;
        return;
      }
      if (!canStep(direction)) {
        if (wheelCaptured) event.preventDefault();
        return;
      }
      event.preventDefault();
      wheelCaptured = true;
      // Animation completion does not rearm the gesture, including at the chair boundary.
      if (wheelMoved || (isMomentum && !reversed)) return;
      wheelDistance += delta;
      if (animationFrame !== null || Math.abs(wheelDistance) < WHEEL_THRESHOLD) return;
      step(Math.sign(wheelDistance));
      wheelMoved = true;
    }

    const unsubscribe = gestures.on("wheel", onGesture);

    function onWheel(event) {
      if (
        event.defaultPrevented || event.ctrlKey || event.metaKey || !event.cancelable ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ) return;
      gestures.feedWheel(event);
    }

    function onTouchStart(event) {
      touch = event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY, moved: false }
        : null;
    }

    function onTouchMove(event) {
      if (!touch || event.touches.length !== 1 || !event.cancelable) return;
      const dy = touch.y - event.touches[0].clientY;
      const dx = touch.x - event.touches[0].clientX;
      if (Math.abs(dx) >= Math.abs(dy)) return;
      if (!canStep(Math.sign(dy)) && !touch.moved) return;
      event.preventDefault();
      if (touch.moved || Math.abs(dy) < 40 || animationFrame !== null) return;
      step(Math.sign(dy));
      touch.moved = true;
    }

    function onTouchEnd() {
      touch = null;
    }

    function onKeyDown(event) {
      if (
        event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest("a, button, input, textarea, select, [contenteditable='true']")
      ) return;
      const direction = {
        ArrowDown: 1,
        PageDown: 1,
        ArrowUp: -1,
        PageUp: -1,
        " ": event.shiftKey ? -1 : 1
      }[event.key];
      if (!direction || !canStep(direction)) return;
      event.preventDefault();
      if (!event.repeat) step(direction);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsubscribe();
      gestures.disconnect();
      stopTransition();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [heroRef]);
}
