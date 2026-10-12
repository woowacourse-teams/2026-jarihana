import * as Sentry from "@sentry/react";

import { safeUrl } from "../shared/analytics/privacy";

const NETWORK_BREADCRUMBS = new Set(["fetch", "xhr"]);

function safeHttpMethod(value) {
  return typeof value === "string" && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(value)
    ? value.toUpperCase()
    : undefined;
}

function safeNavigationUrl(value) {
  return typeof value === "string" ? safeUrl(value) : undefined;
}

function sanitizeBreadcrumb(breadcrumb) {
  const { category, data = {}, timestamp, type, level } = breadcrumb;

  if (NETWORK_BREADCRUMBS.has(category)) {
    return {
      category,
      data: {
        method: safeHttpMethod(data.method),
        status_code: Number.isInteger(data.status_code) ? data.status_code : undefined,
        url: safeNavigationUrl(data.url)
      },
      level,
      timestamp,
      type
    };
  }

  if (category === "navigation") {
    return {
      category,
      data: {
        from: safeNavigationUrl(data.from),
        to: safeNavigationUrl(data.to)
      },
      level,
      timestamp,
      type
    };
  }

  // Drop console and DOM breadcrumbs, which can contain user generated text or input.
  return null;
}

const dsn = process.env.APP_SENTRY_DSN || "";

if (dsn && process.env.NODE_ENV !== "test") {
  Sentry.init({
    dsn,
    environment: process.env.APP_DEPLOY_ENV || "development",
    release: process.env.APP_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    autoSessionTracking: false,
    maxBreadcrumbs: 30,
    beforeBreadcrumb: sanitizeBreadcrumb,
    beforeSend(event) {
      if (event.request) {
        event.request.url = safeNavigationUrl(event.request.url);
        delete event.request.query_string;
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.env;
      }

      delete event.user;
      if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb).filter(Boolean);
      return event;
    }
  });
}
