import { useEffect, useMemo, useRef, useState } from "react";
import { fetchClubhouseWeather } from "../../features/group-space/api.js";
import { liveOutdoors } from "./roomOutdoors.js";

const REFRESH_MS = 15 * 60 * 1000;
const CLOCK_STEP_MS = 60 * 1000;

export function useLiveOutdoors(enabled) {
  const [now, setNow] = useState(Date.now);
  const [report, setReport] = useState(null);
  const hasReport = useRef(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let requestedAt = -Infinity;
    let minuteTimer;
    function update() {
      const time = Date.now();
      setNow(time);
      window.clearTimeout(minuteTimer);
      if (document.hidden) return;
      minuteTimer = window.setTimeout(update, CLOCK_STEP_MS - time % CLOCK_STEP_MS);
      if (time - requestedAt < REFRESH_MS) return;
      requestedAt = time;
      fetchClubhouseWeather(controller.signal).then((weather) => {
        if (controller.signal.aborted) return;
        hasReport.current = true;
        setReport(weather);
      }).catch(() => {
        if (!controller.signal.aborted && hasReport.current) setReport((previous) => previous.stale ? previous : { ...previous, stale: true });
      });
    }
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      window.clearTimeout(minuteTimer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [enabled]);
  return useMemo(() => enabled ? liveOutdoors(now, report) : null, [enabled, now, report]);
}
