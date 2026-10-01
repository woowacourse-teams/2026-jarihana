import { useCallback, useEffect, useRef, useState } from "react";

import { campusPositionStatus } from "./pangyoCampus.js";

const INSIDE_EXPIRY_MS = 5 * 60 * 1000;
const GEOLOCATION_TIMEOUT_MS = 10000;

function geolocationUnavailable() {
  return typeof navigator === "undefined" || !navigator.geolocation;
}

export function usePangyoCampus() {
  const [status, setStatus] = useState("idle");
  const expiryTimer = useRef(null);
  const requestId = useRef(0);
  const mounted = useRef(false);

  const clearExpiry = useCallback(() => {
    if (!expiryTimer.current) return;
    window.clearTimeout(expiryTimer.current);
    expiryTimer.current = null;
  }, []);

  const resetToIdle = useCallback(() => {
    requestId.current += 1;
    clearExpiry();
    if (mounted.current) {
      setStatus("idle");
    }
  }, [clearExpiry]);

  useEffect(() => {
    mounted.current = true;

    function handleVisibilityChange() {
      if (document.hidden) {
        resetToIdle();
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      mounted.current = false;
      requestId.current += 1;
      clearExpiry();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [clearExpiry, resetToIdle]);

  const requestLocation = useCallback(() => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    clearExpiry();

    if (geolocationUnavailable()) {
      setStatus("unsupported");
      return;
    }

    setStatus("locating");

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (!mounted.current || requestId.current !== currentRequest) return;

          const nextStatus = campusPositionStatus(coords);
          setStatus(nextStatus);

          if (nextStatus === "inside") {
            expiryTimer.current = window.setTimeout(() => {
              if (!mounted.current || requestId.current !== currentRequest) return;
              setStatus("idle");
            }, INSIDE_EXPIRY_MS);
          }
        },
        (error) => {
          if (!mounted.current || requestId.current !== currentRequest) return;
          setStatus(error?.code === 1 ? "denied" : "unavailable");
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: GEOLOCATION_TIMEOUT_MS
        }
      );
    } catch {
      if (!mounted.current || requestId.current !== currentRequest) return;
      setStatus("unavailable");
    }
  }, [clearExpiry]);

  return {
    isAtPangyo: status === "inside",
    requestLocation,
    status
  };
}
