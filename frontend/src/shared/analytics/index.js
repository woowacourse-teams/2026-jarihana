import { createAnalytics } from "./client";
import { readAnalyticsConfig } from "./config";

let analytics;
function client() {
  if (!analytics)
    analytics = createAnalytics({
      config: readAnalyticsConfig(),
      loadClient: () => import("posthog-js").then((module) => module.default)
    });
  return analytics;
}

function safely(method, args, fallback) {
  try {
    return client()[method](...args);
  } catch {
    return fallback;
  }
}

export const initializeAnalytics = () => safely("initializeAnalytics", [], Promise.resolve(false));
export const setAnalyticsRoute = (path, properties) =>
  safely("setAnalyticsRoute", [path, properties]);
export const syncAnalyticsIdentity = (status, id) =>
  safely("syncAnalyticsIdentity", [status, id], Promise.resolve(false));
export const trackPage = (path) => safely("trackPage", [path]);
export const captureEvent = (event, properties) =>
  safely("captureEvent", [event, properties], false);
export const startRequestTracking = (metadata) =>
  safely("startRequestTracking", [metadata], { finish() {} });
