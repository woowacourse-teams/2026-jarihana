import { useEffect, useRef, useState } from "react";

function canObserveIntersection() {
  return typeof IntersectionObserver !== "undefined";
}

function isDocumentVisible() {
  return typeof document === "undefined" || !document.hidden;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    function handleChange(event) {
      setReduced(event.matches);
    }

    query.addEventListener?.("change", handleChange);
    return () => {
      query.removeEventListener?.("change", handleChange);
    };
  }, []);

  return reduced;
}

export function useLandingDemo({ active = true } = {}) {
  const rootRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const canObserve = canObserveIntersection();
  const [hasStarted, setHasStarted] = useState(() => active && !canObserve);
  const [inView, setInView] = useState(() => !canObserve);
  const [documentVisible, setDocumentVisible] = useState(isDocumentVisible);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    if (reducedMotion) return undefined;

    function reset() {
      setHasStarted(false);
      setComplete(false);
      setManuallyPaused(false);
    }

    if (!active) {
      reset();
      return undefined;
    }

    const node = rootRef.current;
    if (!node || !canObserve) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextVisible = entry.isIntersecting;
        setInView(nextVisible);
        if (!nextVisible) reset();
        else if ((entry.intersectionRatio ?? 1) >= 0.35) setHasStarted(true);
      },
      { threshold: [0, 0.35] }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [active, canObserve, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || typeof document === "undefined") return undefined;

    function handleVisibilityChange() {
      setDocumentVisible(!document.hidden);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reducedMotion]);

  const observedInView = canObserve ? inView : true;
  const started = hasStarted || (active && !canObserve);
  const timelineComplete = reducedMotion || complete;
  const paused =
    !reducedMotion &&
    started &&
    !complete &&
    (!active || manuallyPaused || !observedInView || !documentVisible);
  const state = timelineComplete ? "complete" : started ? "running" : "idle";

  function replay() {
    if (reducedMotion) return;
    setComplete(false);
    setManuallyPaused(false);
    setHasStarted(true);
    setReplayKey((current) => current + 1);
  }

  function togglePaused() {
    if (timelineComplete) return;
    setManuallyPaused((current) => !current);
  }

  function finish() {
    if (reducedMotion || !started || !active || manuallyPaused || !observedInView || !documentVisible) return;
    setComplete(true);
  }

  return {
    finish,
    paused,
    reducedMotion,
    replay,
    replayKey,
    rootRef,
    state,
    timelineComplete,
    togglePaused
  };
}
