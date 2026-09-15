import { maskNetworkRequest, safeUrl } from "./privacy";

export function readAnalyticsConfig() {
  const key = process.env.APP_POSTHOG_PROJECT_TOKEN || "";
  const host = process.env.APP_POSTHOG_HOST || "";
  const environment = process.env.APP_DEPLOY_ENV || "development";
  let validHost = false;
  try {
    const url = new URL(host);
    validHost =
      url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    /* A missing host keeps analytics disabled. */
  }
  return {
    key,
    host,
    environment,
    enabled:
      process.env.APP_ANALYTICS_ENABLED === "true" &&
      key.startsWith("phc_") &&
      validHost &&
      ["production", "staging"].includes(environment) &&
      process.env.NODE_ENV !== "test"
  };
}

export const automaticCapture = {
  autocapture: { dom_event_allowlist: ["click", "change", "submit"], capture_copied_text: false },
  capture_pageleave: true,
  capture_heatmaps: true,
  capture_performance: { web_vitals: true, network_timing: true },
  capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true }
};

export const pausedCapture = {
  autocapture: false,
  capture_pageleave: false,
  capture_heatmaps: false,
  capture_performance: false,
  capture_exceptions: false,
  disable_session_recording: true
};

export function sdkConfig(config, beforeSend) {
  return {
    api_host: config.host,
    defaults: "2026-05-30",
    ...pausedCapture,
    capture_pageview: false,
    persistence: "localStorage+cookie",
    cross_subdomain_cookie: false,
    person_profiles: "identified_only",
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    enable_recording_console_log: false,
    ip: false,
    get_current_url: safeUrl,
    before_send: beforeSend,
    session_recording: {
      sampleRate: 1,
      maskAllInputs: true,
      maskTextSelector: "*",
      maskAllElementAttributes: true,
      blockSelector:
        'img, picture, video, canvas, iframe, input[type="hidden"], input[type="file"], [data-ph-private]',
      recordHeaders: false,
      recordBody: false,
      streamNetworkBody: false,
      captureJsonLd: false,
      captureCanvas: { recordCanvas: false },
      recordCrossOriginIframes: false,
      maskCapturedNetworkRequestFn: maskNetworkRequest
    }
  };
}
