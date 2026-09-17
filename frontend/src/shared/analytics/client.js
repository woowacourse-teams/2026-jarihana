import { automaticCapture, pausedCapture, sdkConfig } from "./config";
import { isPrivateRoute, normalizePath, sanitizeEvent, sanitizeProperties } from "./privacy";
import { clearPromotionAttribution } from "./promotion";

const businessEvents = new Set([
  "signup_completed",
  "registration_started",
  "registration_submitted",
  "registration_withdrawn",
  "registration_decided",
  "group_created",
  "recruitment_created",
  "recruitment_closed"
]);
const noopRequest = { finish() {} };

export function createAnalytics({ config, loadClient, storage, now = () => performance.now() }) {
  if (!storage) {
    try {
      storage = globalThis.localStorage;
    } catch {
      /* Storage may be denied. */
    }
  }
  let sdk;
  let initializing;
  let ready = false;
  let pathname = globalThis.location?.pathname || "/";
  let lastPage;
  let routeProperties = {};
  let desired;
  let revision = 0;
  let identityRevision = 0;
  let requestSequence = 0;
  const memberKey = `jarihana.analytics.member.${config.key}`;
  const storedMember = () => {
    try {
      return storage?.getItem(memberKey);
    } catch {
      return null;
    }
  };
  let member = config.enabled ? storedMember() : null;
  const storeMember = (id) => {
    try {
      if (id) storage?.setItem(memberKey, id);
      else storage?.removeItem(memberKey);
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  };
  const permitted = () =>
    ready && !isPrivateRoute(pathname) && !isPrivateRoute(globalThis.location?.pathname);
  const pause = () => {
    ready = false;
    try {
      sdk?.stopSessionRecording();
      sdk?.set_config(pausedCapture);
    } catch {
      /* Analytics is optional. */
    }
  };

  function initializeAnalytics() {
    if (!config.enabled || isPrivateRoute(pathname)) return Promise.resolve(false);
    if (!initializing) {
      initializing = Promise.resolve()
        .then(loadClient)
        .then((client) => {
          sdk = client;
          sdk.init(
            config.key,
            sdkConfig(config, (event) => {
              if (!permitted()) return null;
              // Replay has its own DOM/network sanitizers; snapshot payloads are not product events.
              if (event.event === "$snapshot") return event;
              try {
                return sanitizeEvent(event);
              } catch {
                return null;
              }
            })
          );
          return true;
        })
        .catch(() => {
          sdk = undefined;
          return false;
        });
    }
    return initializing;
  }

  function setAnalyticsRoute(path, properties = {}) {
    pathname = path;
    routeProperties = sanitizeProperties(properties);
    if (isPrivateRoute(path)) {
      lastPage = undefined;
      revision++;
      pause();
    } else if (permitted()) {
      registerRoute();
    }
  }

  function registerRoute() {
    try {
      for (const key of ["route_name", "group_id", "recruitment_id", "promotion_id"])
        sdk.unregister(key);
      sdk.register({ ...routeProperties, pathname: normalizePath(pathname) });
    } catch {
      /* Route tracking must not interrupt navigation. */
    }
  }

  function setMember(id) {
    const persistedId = sdk.get_property("$user_id");
    if ((member && member !== id) || (persistedId && String(persistedId) !== id)) {
      clearPromotionAttribution();
      sdk.stopSessionRecording();
      sdk.reset(true);
      identityRevision++;
      lastPage = undefined;
    }
    if (id && member !== id) sdk.identify(id);
    if (id !== member) {
      member = id;
      storeMember(id);
    }
  }

  async function syncAnalyticsIdentity(status, id) {
    const nextId =
      status === "authenticated" && (typeof id === "number" || typeof id === "string")
        ? String(id)
        : null;
    const next = `${status}:${nextId}`;
    if (next === desired && permitted()) return true;
    desired = next;
    const ticket = ++revision;
    pause();
    if (
      !["authenticated", "anonymous", "signup-required"].includes(status) ||
      (status === "authenticated" && !nextId) ||
      isPrivateRoute(pathname)
    )
      return false;
    if (!(await initializeAnalytics()) || ticket !== revision) return false;
    try {
      if (sdk.has_opted_out_capturing()) return false;
      // Identify events may pass the gate, but autocapture/replay remain paused until identity is settled.
      ready = true;
      setMember(nextId);
      // Refresh identity on a new page load even when our persisted marker already matches.
      if (nextId && sdk.get_distinct_id() !== nextId) sdk.identify(nextId);
      sdk.register({ environment: config.environment });
      registerRoute();
      sdk.set_config(automaticCapture);
      sdk.startSessionRecording();
      return true;
    } catch {
      pause();
      return false;
    }
  }

  function captureEvent(event, properties = {}) {
    if (!permitted() || !businessEvents.has(event)) return false;
    try {
      const safe = sanitizeProperties(properties);
      if (event === "signup_completed" && safe.member_id !== undefined)
        setMember(String(safe.member_id));
      sdk.capture(event, safe);
      return true;
    } catch {
      return false;
    }
  }

  function trackPage(path) {
    if (!permitted() || lastPage === path) return;
    try {
      const safePath = normalizePath(path);
      sdk.register({ pathname: safePath });
      sdk.capture("$pageview", {
        pathname: safePath,
        $pathname: safePath,
        ...(routeProperties.group_id !== undefined
          ? { group_id: routeProperties.group_id }
          : {}),
        ...(routeProperties.promotion_id !== undefined
          ? { promotion_id: routeProperties.promotion_id }
          : {})
      });
      lastPage = path;
    } catch {
      /* A tracking failure must not break navigation. */
    }
  }

  function startRequestTracking(metadata) {
    if (!permitted()) return noopRequest;
    let started;
    let distinctId;
    let sessionId;
    try {
      started = now();
      distinctId = sdk.get_distinct_id();
      sessionId = sdk.get_session_id?.();
    } catch {
      return noopRequest;
    }
    const identity = identityRevision;
    const safe = { ...routeProperties, ...sanitizeProperties(metadata) };
    const requestPath = normalizePath(pathname);
    const requestId = `request-${Date.now()}-${++requestSequence}`;
    let finished = false;
    return {
      finish(result) {
        if (finished) return;
        finished = true;
        // Late responses after an account switch must not attach to the next user.
        try {
          if (!permitted() || identity !== identityRevision || sdk.get_distinct_id() !== distinctId)
            return;
          sdk.capture("api_request_completed", {
            route_name: null,
            group_id: null,
            recruitment_id: null,
            ...safe,
            ...sanitizeProperties(result),
            pathname: requestPath,
            ...(sessionId ? { $session_id: sessionId } : {}),
            request_id: requestId,
            duration_ms: Math.max(0, Math.round(now() - started))
          });
        } catch {
          /* Keep the application response unchanged. */
        }
      }
    };
  }

  return {
    initializeAnalytics,
    setAnalyticsRoute,
    syncAnalyticsIdentity,
    captureEvent,
    trackPage,
    startRequestTracking
  };
}
