import { useCallback, useEffect, useState } from "react";

const AUTO_ROTATION_INTERVAL = 5000;

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
  const [hoverPaused, setHoverPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
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

  const goTo = useCallback(
    (index, { pause = false } = {}) => {
      setRawActiveIndex((current) => {
        const forward = normalizeIndex(index - normalizeIndex(current, itemCount), itemCount);
        const distance = forward > itemCount / 2 ? forward - itemCount : forward;
        return itemCount > 1 ? current + distance : 0;
      });
      if (pause) setUserPaused(true);
    },
    [itemCount]
  );

  const step = useCallback(
    (distance, { pause = false } = {}) => {
      setRawActiveIndex((current) => (itemCount > 1 ? current + distance : 0));
      if (pause) setUserPaused(true);
    },
    [itemCount]
  );
  const goNext = useCallback((options) => step(1, options), [step]);
  const goPrevious = useCallback((options) => step(-1, options), [step]);

  const autoPaused =
    itemCount <= 1 || focusPaused || hoverPaused || userPaused || pageHidden || reducedMotion;

  useEffect(() => {
    if (autoPaused) return undefined;

    const timer = window.setInterval(() => {
      setRawActiveIndex((current) => current + 1);
    }, interval);

    return () => window.clearInterval(timer);
  }, [autoPaused, interval, itemCount]);

  return {
    activeIndex,
    activePosition,
    goNext,
    goPrevious,
    goTo,
    isAutoPlaying: !autoPaused,
    pauseFocus: () => setFocusPaused(true),
    pauseHover: () => setHoverPaused(true),
    reducedMotion,
    resumeFocus: () => setFocusPaused(false),
    resumeHover: () => setHoverPaused(false),
    setUserPaused,
    userPaused
  };
}
