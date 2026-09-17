const pathSegments = new Set([
  "api",
  "auth",
  "refresh",
  "logout",
  "members",
  "me",
  "groups",
  "new",
  "manage",
  "recruitments",
  "registrations",
  "summary",
  "read",
  "history",
  "leader",
  "my",
  "signup",
  "image-uploads",
  "recurring-schedule",
  "session-schedule",
  "schedules",
  "recurring",
  "sessions",
  "terminate",
  "close",
  "decision"
]);
const safeId = (value) =>
  (typeof value === "number" && Number.isSafeInteger(value)) ||
  (typeof value === "string" && /^(\d+|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value));
const safeLabel = (value) =>
  typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value);

const safePromotionId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);

export function sanitizePromotionId(value) {
  return safePromotionId(value) ? value : undefined;
}

export const isPrivateRoute = (path = "") => {
  try {
    return /^\/(?:api\/)?oauth(?:\/|$)/i.test(decodeURIComponent(path));
  } catch {
    return true;
  }
};

export function normalizePath(value = "/") {
  if (value === "storage_upload") return value;
  try {
    const path = new URL(value, "https://analytics.invalid").pathname;
    return (
      "/" +
      path
        .split("/")
        .filter(Boolean)
        .map((part) => {
          if (pathSegments.has(part) || [":id", ":redacted"].includes(part)) return part;
          return safeId(part) ? ":id" : ":redacted";
        })
        .join("/")
    );
  } catch {
    return "/:redacted";
  }
}

export function safeUrl(value) {
  try {
    const url = new URL(value, globalThis.location?.origin || "https://analytics.invalid");
    return url.origin + normalizePath(url.pathname);
  } catch {
    return undefined;
  }
}

export function sanitizeProperties(properties = {}) {
  const result = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      ["group_id", "recruitment_id", "registration_id", "member_id"].includes(key) &&
      safeId(value)
    ) {
      result[key] = value;
    } else if (key === "promotion_id" && safePromotionId(value)) {
      result[key] = value;
    } else if (
      [
        "action",
        "route_name",
        "group_type",
        "recruitment_method",
        "decision",
        "status",
        "provider",
        "outcome",
        "error_code",
        "method",
        "environment"
      ].includes(key) &&
      safeLabel(value)
    ) {
      result[key] = value;
    } else if (["status", "duration_ms", "attempt"].includes(key) && Number.isFinite(value)) {
      result[key] = Math.max(0, value);
    } else if (
      ["logical_request_id", "request_id"].includes(key) &&
      typeof value === "string" &&
      /^[\w-]{1,100}$/.test(value)
    ) {
      result[key] = value;
    } else if (key === "is_auth_refresh" && typeof value === "boolean") {
      result[key] = value;
    } else if (["endpoint", "pathname"].includes(key) && typeof value === "string") {
      result[key] = normalizePath(value);
    }
  }
  return result;
}

const sdkFields = new Set([
  "token",
  "distinct_id",
  "$anon_distinct_id",
  "$device_id",
  "$user_id",
  "$session_id",
  "$window_id",
  "$pageview_id",
  "$is_identified",
  "$process_person_profile",
  "$lib",
  "$lib_version",
  "$os",
  "$os_version",
  "$browser",
  "$browser_version",
  "$device_type",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$event_type",
  "$ce_version",
  "$sdk_debug_current_session_duration"
]);
const urlFields = new Set([
  "$current_url",
  "$referrer",
  "$initial_current_url",
  "$initial_referrer"
]);

function sanitizeElements(elements) {
  return elements.map((element) =>
    Object.fromEntries(
      Object.entries(element).filter(
        ([key, value]) =>
          ["tag_name", "nth_child", "nth_of_type"].includes(key) &&
          (typeof value === "number" || safeLabel(value))
      )
    )
  );
}

function sanitizeHeatmap(data) {
  const result = {};
  for (const [url, points] of Object.entries(data)) {
    const safe = safeUrl(url);
    if (!safe || !Array.isArray(points)) continue;
    result[safe] = [
      ...(result[safe] || []),
      ...points.map((point) => ({
        x: Number.isFinite(point.x) ? point.x : 0,
        y: Number.isFinite(point.y) ? point.y : 0,
        target_fixed: point.target_fixed === true,
        type: ["click", "mousemove", "rageclick", "deadclick"].includes(point.type)
          ? point.type
          : "click"
      }))
    ];
  }
  return result;
}

export function sanitizeEvent(event) {
  const properties = sanitizeProperties(event.properties);
  for (const [key, value] of Object.entries(event.properties || {})) {
    if (sdkFields.has(key) && ["string", "number", "boolean"].includes(typeof value))
      properties[key] = value;
    else if (urlFields.has(key) && typeof value === "string") properties[key] = safeUrl(value);
    else if (key === "$pathname") properties[key] = normalizePath(value);
    else if (key === "$elements" && Array.isArray(value)) properties[key] = sanitizeElements(value);
    else if (
      key === "$elements_chain" &&
      typeof value === "string" &&
      value.length <= 4096 &&
      /^(?:[a-z][a-z0-9-]*:nth-child="\d+"nth-of-type="\d+")(?:;[a-z][a-z0-9-]*:nth-child="\d+"nth-of-type="\d+")*$/.test(
        value
      )
    )
      properties[key] = value;
    else if (["$set", "$set_once"].includes(key) && value && typeof value === "object") {
      properties[key] = sanitizeEvent({ properties: value }).properties;
    } else if (key === "$heatmap_data" && value && typeof value === "object")
      properties[key] = sanitizeHeatmap(value);
    else if (key.startsWith("$web_vitals_") && Number.isFinite(value)) properties[key] = value;
    else if (/^\$web_vitals_\w+_event$/.test(key) && value && typeof value === "object") {
      properties[key] = Object.fromEntries(
        Object.entries(value).filter(
          ([field, entry]) =>
            (["name", "id", "rating", "navigationType", "$session_id", "$window_id"].includes(
              field
            ) &&
              typeof entry === "string" &&
              /^[\w.-]{1,100}$/.test(entry)) ||
            (["value", "delta", "timestamp"].includes(field) && Number.isFinite(entry))
        )
      );
    } else if (key === "$exception_list" && Array.isArray(value)) {
      properties[key] = value.map((exception) => ({
        type: safeLabel(exception.type) ? exception.type : "Error",
        value: "[redacted]",
        mechanism: { type: "generic", handled: exception.mechanism?.handled === true },
        stacktrace: {
          frames: (exception.stacktrace?.frames || []).map((frame) => ({
            filename: safeUrl(frame.filename),
            lineno: frame.lineno,
            colno: frame.colno
          }))
        }
      }));
    }
  }
  const result = { ...event, properties };
  for (const key of ["$set", "$set_once"]) {
    if (event[key]) result[key] = sanitizeEvent({ properties: event[key] }).properties;
  }
  delete result.$unset;
  return result;
}

export function maskNetworkRequest(request) {
  if (!request || isPrivateRoute(globalThis.location?.pathname)) return null;
  try {
    const url = new URL(request.name, globalThis.location?.origin);
    if (url.origin !== globalThis.location?.origin || isPrivateRoute(url.pathname)) return null;
    // Deliberately reconstruct metadata so headers, bodies and signed URLs cannot survive.
    const result = { name: safeUrl(url.href) };
    for (const key of ["startTime", "endTime", "timeOrigin", "timestamp", "duration", "status"]) {
      if (Number.isFinite(request[key])) result[key] = request[key];
    }
    for (const key of ["entryType", "initiatorType", "method"]) {
      if (safeLabel(request[key])) result[key] = request[key];
    }
    return result;
  } catch {
    return null;
  }
}
