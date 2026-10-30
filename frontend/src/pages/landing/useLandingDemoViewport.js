import { useEffect, useRef } from "react";

const MOBILE_DEMO = "(max-width: 63.9375rem) and (min-height: 32rem) and (prefers-reduced-motion: no-preference)";

const cameraPaths = {
  browse: [[0, "top"], [0.34, "top"], [0.46, "focus"], [0.72, "focus"], [0.9, "end"], [1, "end"]],
  detail: [[0, "top"], [0.13, "top"], [0.25, "end"], [1, "end"]],
  continue: [[0, "top"], [0.15, "top"], [0.28, "focus"], [0.47, "focus"], [0.6, "end"], [1, "end"]],
  proposal: [[0, "top"], [0.4, "top"], [0.56, "end"], [1, "end"]],
  create: [[0, "top"], [0.58, "top"], [0.69, "focus"], [0.83, "focus"], [0.93, "end"], [1, "end"]],
  manage: [[0, "top"], [0.25, "top"], [0.38, "focus"], [0.72, "focus"], [0.88, "end"], [1, "end"]],
  invite: [[0, "top"], [0.18, "top"], [0.33, "end"], [0.69, "end"], [0.81, "top"], [1, "top"]],
  chat: [[0, "top"], [0.22, "top"], [0.32, "end"], [1, "end"]],
  calendar: [[0, "top"], [0.4, "top"], [0.55, "end"], [1, "end"]],
  activity: [[0, "top"], [0.28, "top"], [0.4, "end"], [1, "end"]],
  sparring: [[0, "top"], [0.42, "top"], [0.58, "end"], [1, "end"]]
};

const focusSelectors = {
  browse: ".lps-discovery-cards",
  continue: ".lps-dashboard-panel",
  create: ".lpc-editor",
  manage: ".lps-applicant"
};

function syncPlayback(animations, { state, paused }) {
  for (const animation of animations) {
    if (state === "complete") {
      animation.finish();
    } else if (state === "idle") {
      animation.pause();
      animation.currentTime = 0;
    } else if (paused) {
      animation.pause();
    } else {
      if (animation.playState === "finished") animation.currentTime = 0;
      animation.play();
    }
  }
}

export function useLandingDemoViewport({ rootRef, screen, state, paused, replayKey }) {
  const animationsRef = useRef([]);
  const playbackRef = useRef({ state, paused });

  useEffect(() => {
    const root = rootRef.current;
    const viewport = root?.querySelector(".landing-guide-frame__screen");
    const scene = viewport?.querySelector(".landing-product-scene");
    const path = cameraPaths[screen];
    if (!scene?.animate || !path) return undefined;
    const media = window.matchMedia(MOBILE_DEMO);

    function measure() {
      const elapsed = animationsRef.current[0]?.currentTime ?? 0;
      animationsRef.current.forEach((animation) => animation.cancel());
      animationsRef.current = [];
      if (!media.matches || viewport.clientHeight === 0) return;

      const styles = getComputedStyle(root);
      const duration = parseFloat(styles.getPropertyValue("--demo-duration") || styles.getPropertyValue("--lpc-duration")) * 1000 /
        (parseFloat(styles.getPropertyValue("--landing-demo-speed")) || 1.5);
      const end = Math.max(0, scene.offsetHeight - viewport.clientHeight);
      const target = scene.querySelector(focusSelectors[screen] ?? ":scope");
      let focus = 0;
      for (let node = target; node && node !== scene; node = node.offsetParent) focus += node.offsetTop;
      const positions = { top: 0, focus: Math.min(end, Math.max(0, focus - parseFloat(getComputedStyle(scene).paddingTop))), end };
      const easing = styles.getPropertyValue("--landing-ease").trim() || "ease-in-out";
      root.style.setProperty("--demo-viewport-height", `${viewport.clientHeight}px`);

      function animate(element, direction, stops = path, distances = positions) {
        const animation = element.animate(stops.map(([offset, position]) => ({
          offset,
          translate: `0 ${distances[position] * direction}px`,
          easing
        })), { duration, fill: "both" });
        animation.pause();
        animation.currentTime = Math.min(elapsed, duration);
        animationsRef.current.push(animation);
      }

      animate(scene, -1);
      const overlay = scene.querySelector(".lps-application-overlay, .lpc-schedule-dialog, .lpa-notifications");
      if (overlay) {
        animate(overlay, 1);
        const dialog = overlay.querySelector(".lps-application, .lpc-dialog-card");
        if (dialog) {
          const overlayStyles = getComputedStyle(overlay);
          const overflow = dialog.offsetHeight - viewport.clientHeight +
            parseFloat(overlayStyles.paddingTop) + parseFloat(overlayStyles.paddingBottom);
          if (overflow > 0) {
            const stops = screen === "create"
              ? [[0, "top"], [0.34, "top"], [0.5, "end"], [1, "end"]]
              : [[0, "top"], [0.28, "top"], [0.55, "end"], [1, "end"]];
            animate(dialog, -1, stops, { top: 0, end: overflow });
          }
        }
      }
      syncPlayback(animationsRef.current, playbackRef.current);
    }

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(scene);
    media.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
      animationsRef.current.forEach((animation) => animation.cancel());
      animationsRef.current = [];
      root.style.removeProperty("--demo-viewport-height");
    };
  }, [rootRef, screen, replayKey]);

  useEffect(() => {
    playbackRef.current = { state, paused };
    syncPlayback(animationsRef.current, playbackRef.current);
  }, [state, paused, replayKey]);
}
