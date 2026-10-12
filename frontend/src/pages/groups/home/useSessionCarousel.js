import { useCallback, useEffect, useState } from "react";

const AUTO_ROTATION_INTERVAL = 5000;
const INTERACTION_IDLE_DELAY = 10000;

function normalizeIndex(index, itemCount) {
  if (itemCount <= 0) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

function readsReducedMotion() {
  return Boolean(
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}

export function useSessionCarousel(itemCount, { interval = AUTO_ROTATION_INTERVAL, initialIndex = 0 } = {}) {
  const [rawActiveIndex, setRawActiveIndex] = useState(initialIndex);
  const [focusPaused, setFocusPaused] = useState(false);
  const [interactionPausedUntil, setInteractionPausedUntil] = useState(null);
  const [pageHidden, setPageHidden] = useState(
    () => typeof document !== "undefined" && document.hidden
  );
  const [reducedMotion, setReducedMotion] = useState(readsReducedMotion);
  const activeIndex = normalizeIndex(rawActiveIndex, itemCount);
  const activePosition = itemCount > 1 ? rawActiveIndex : 0;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    function handleVisibilityChange() {
      setPageHidden(document.hidden);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    function handleMotionPreferenceChange(event) {
      setReducedMotion(event.matches);
    }

    query.addEventListener?.("change", handleMotionPreferenceChange);
    return () => query.removeEventListener?.("change", handleMotionPreferenceChange);
  }, []);

  const pauseInteraction = useCallback(() => {
    const idleUntil = Date.now() + INTERACTION_IDLE_DELAY;
    setInteractionPausedUntil((current) => Math.max(current ?? 0, idleUntil));
  }, []);

  const goTo = useCallback(
    (index, { pause = false } = {}) => {
      setRawActiveIndex((current) => {
        const forward = normalizeIndex(index - normalizeIndex(current, itemCount), itemCount);
        const distance = forward > itemCount / 2 ? forward - itemCount : forward;
        return itemCount > 1 ? current + distance : 0;
      });
      if (pause) pauseInteraction();
    },
    [itemCount, pauseInteraction]
  );

  const step = useCallback(
    (distance, { pause = false } = {}) => {
      setRawActiveIndex((current) => (itemCount > 1 ? current + distance : 0));
      if (pause) pauseInteraction();
    },
    [itemCount, pauseInteraction]
  );
  const goNext = useCallback((options) => step(1, options), [step]);
  const goPrevious = useCallback((options) => step(-1, options), [step]);

  const autoPaused = itemCount <= 1 || focusPaused || pageHidden || reducedMotion;

  useEffect(() => {
    if (autoPaused) return undefined;

    const remainingInteractionDelay = Math.max((interactionPausedUntil ?? 0) - Date.now(), 0);
    if (remainingInteractionDelay > 0) {
      const timer = window.setTimeout(() => {
        setInteractionPausedUntil(null);
        setRawActiveIndex((current) => current + 1);
      }, remainingInteractionDelay);

      return () => window.clearTimeout(timer);
    }

    const timer = window.setInterval(() => {
      setRawActiveIndex((current) => current + 1);
    }, interval);

    return () => window.clearInterval(timer);
  }, [autoPaused, interactionPausedUntil, interval, itemCount]);

  return {
    activeIndex,
    activePosition,
    goNext,
    goPrevious,
    goTo,
    pauseFocus: () => setFocusPaused(true),
    pauseInteraction,
    reducedMotion,
    resumeFocus: () => setFocusPaused(false)
  };
}
