const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const REPORT_INTERVAL_MS = 10 * 1000;
const MOUSE_ACTIVITY_INTERVAL_MS = 1000;

export function createChatActivityReporter({ isConnected, report }) {
  let stopped = false;
  let pageHidden = false;
  let lastActivityAt = Date.now();
  let lastMouseActivityAt = -Infinity;
  let reportTimer;
  let idleTimer;
  const visibleAndFocused = () => !pageHidden && document.visibilityState === "visible" && document.hasFocus();
  let screenActive = visibleAndFocused();
  const active = () => !stopped && visibleAndFocused() && Date.now() - lastActivityAt < IDLE_TIMEOUT_MS;

  function send() {
    if (!active() || !isConnected()) return;
    try { report(); }
    catch { /* A connection can close between the check and publish. Never queue activity. */ }
  }

  function reconcile() {
    window.clearTimeout(idleTimer);
    if (!active()) {
      window.clearInterval(reportTimer);
      reportTimer = undefined;
      return;
    }
    if (reportTimer === undefined) {
      send();
      reportTimer = window.setInterval(() => {
        if (active()) send();
        else reconcile();
      }, REPORT_INTERVAL_MS);
    }
    idleTimer = window.setTimeout(reconcile, Math.max(0, lastActivityAt + IDLE_TIMEOUT_MS - Date.now()));
  }

  function activity(event) {
    if (stopped || !visibleAndFocused()) return;
    const now = Date.now();
    if (event.type === "mousemove") {
      if (now - lastMouseActivityAt < MOUSE_ACTIVITY_INTERVAL_MS) return;
      lastMouseActivityAt = now;
    }
    if (!active()) {
      window.clearInterval(reportTimer);
      reportTimer = undefined;
    }
    lastActivityAt = now;
    reconcile();
  }

  function screenChanged() {
    const next = visibleAndFocused();
    if (next && !screenActive) lastActivityAt = Date.now();
    screenActive = next;
    reconcile();
  }
  function pageHide() { pageHidden = true; screenChanged(); }
  function pageShow() { pageHidden = false; screenChanged(); }

  const activityEvents = ["mousemove", "click", "keydown", "scroll", "touchstart", "touchmove"];
  activityEvents.forEach((event) => window.addEventListener(event, activity, { capture: true, passive: true }));
  window.addEventListener("focus", screenChanged);
  window.addEventListener("blur", screenChanged);
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  document.addEventListener("visibilitychange", screenChanged);
  reconcile();

  return {
    connected() {
      // A reconnect is not user activity; retain the existing idle deadline.
      window.clearInterval(reportTimer);
      reportTimer = undefined;
      reconcile();
    },
    stop() {
      stopped = true;
      window.clearInterval(reportTimer);
      window.clearTimeout(idleTimer);
      activityEvents.forEach((event) => window.removeEventListener(event, activity, true));
      window.removeEventListener("focus", screenChanged);
      window.removeEventListener("blur", screenChanged);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", screenChanged);
    }
  };
}
