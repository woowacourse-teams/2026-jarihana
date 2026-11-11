import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const TOUCH = "(pointer: coarse) and (hover: none)";
const PORTRAIT = `${TOUCH} and (orientation: portrait)`;

function subscribeToPortrait(onChange) {
  const query = window.matchMedia?.(PORTRAIT);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function isTouchPortrait() {
  return window.matchMedia?.(PORTRAIT)?.matches ?? false;
}

function undoLandscape(session) {
  if (session.locked) {
    try {
      window.screen.orientation.unlock();
    } catch {
      // A hidden document can reject unlock. Still exit fullscreen if we opened it.
    }
  }
  if (session.fullscreen && document.fullscreenElement === document.documentElement) {
    void document.exitFullscreen().catch(() => {});
  }
}

export function useClubhouseLandscape() {
  const portrait = useSyncExternalStore(subscribeToPortrait, isTouchPortrait, () => false);
  const active = useRef(null);

  const releaseLandscape = useCallback(() => {
    const session = active.current;
    if (!session) return;
    session.cancelled = true;
    if (!session.pending) {
      undoLandscape(session);
      active.current = null;
    }
  }, []);

  const lockLandscape = useCallback(async () => {
    const orientation = window.screen.orientation;
    if (!window.matchMedia?.(TOUCH)?.matches || typeof orientation?.lock !== "function" || active.current) return;

    const session = { pending: true, cancelled: false, fullscreen: false, locked: false };
    active.current = session;
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement && !window.matchMedia("(display-mode: standalone)").matches) {
        await document.documentElement.requestFullscreen().then(() => { session.fullscreen = true; }, () => {});
      }
      if (!session.cancelled) {
        await orientation.lock("landscape");
        session.locked = true;
      }
    } catch {
      // Browsers can reject orientation locks even when the API is exposed.
    } finally {
      session.pending = false;
      if (session.cancelled || !session.locked) {
        undoLandscape(session);
        active.current = null;
      }
    }
  }, []);

  useEffect(() => releaseLandscape, [releaseLandscape]);
  return { portrait, lockLandscape, releaseLandscape };
}
