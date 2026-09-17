import { createAnalytics } from "../../src/shared/analytics/client";
import { readAnalyticsConfig } from "../../src/shared/analytics/config";
import {
  isPrivateRoute,
  maskNetworkRequest,
  normalizePath,
  sanitizeEvent
} from "../../src/shared/analytics/privacy";

function setup(overrides = {}) {
  let id = "anonymous-browser";
  let clock = 0;
  let options;
  const storage = new Map();
  const client = {
    init: jest.fn((_key, config) => {
      options = config;
    }),
    capture: jest.fn(),
    identify: jest.fn((next) => {
      id = next;
    }),
    reset: jest.fn(() => {
      id = "new-anonymous";
    }),
    get_distinct_id: jest.fn(() => id),
    get_property: jest.fn(),
    has_opted_out_capturing: jest.fn(() => false),
    register: jest.fn(),
    unregister: jest.fn(),
    set_config: jest.fn(),
    startSessionRecording: jest.fn(),
    stopSessionRecording: jest.fn()
  };
  const loadClient = jest.fn(async () => client);
  const config = {
    enabled: true,
    key: "phc_test",
    host: "https://us.i.posthog.com",
    environment: "staging"
  };
  const analytics = createAnalytics({
    config,
    loadClient,
    now: () => clock,
    storage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    ...overrides
  });
  return {
    analytics,
    client,
    loadClient,
    config,
    options: () => options,
    tick: () => {
      clock += 125;
    }
  };
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

test("disabled or missing environment does not load SDK", async () => {
  const { analytics, loadClient } = setup({ config: { enabled: false } });
  expect(await analytics.syncAnalyticsIdentity("authenticated", 42)).toBe(false);
  analytics.captureEvent("group_created", { group_id: 1 });
  expect(loadClient).not.toHaveBeenCalled();
  expect(readAnalyticsConfig().enabled).toBe(false);
});

test("initial loading and unknown authentication never start capture", async () => {
  const { analytics, loadClient } = setup();
  expect(await analytics.syncAnalyticsIdentity("loading")).toBe(false);
  expect(await analytics.syncAnalyticsIdentity("unavailable")).toBe(false);
  expect(loadClient).not.toHaveBeenCalled();
});

test("anonymous visits persist until login then logout rotates identity", async () => {
  const { analytics, client } = setup();
  await analytics.syncAnalyticsIdentity("anonymous");
  await analytics.syncAnalyticsIdentity("anonymous");
  expect(client.reset).not.toHaveBeenCalled();
  await analytics.syncAnalyticsIdentity("authenticated", 42);
  expect(client.identify).toHaveBeenCalledWith("42");
  await analytics.syncAnalyticsIdentity("anonymous");
  expect(client.reset).toHaveBeenCalledTimes(1);
});

test("same persisted member refreshes SDK identity on another visit", async () => {
  const { analytics, client } = setup({ storage: { getItem: () => "42", setItem: jest.fn() } });
  await analytics.syncAnalyticsIdentity("authenticated", 42);
  expect(client.identify).toHaveBeenCalledWith("42");
  expect(client.reset).not.toHaveBeenCalled();
});

test("anonymous visitor resets an SDK member even if the app's localStorage marker is missing", async () => {
  const { analytics, client } = setup();
  client.get_property.mockReturnValue("42");
  await analytics.syncAnalyticsIdentity("anonymous");
  expect(client.reset).toHaveBeenCalledWith(true);
});

test("different account resets before identifying", async () => {
  const { analytics, client } = setup();
  await analytics.syncAnalyticsIdentity("authenticated", 42);
  await analytics.syncAnalyticsIdentity("authenticated", 51);
  expect(client.reset).toHaveBeenCalledTimes(1);
  expect(client.reset.mock.invocationCallOrder[0]).toBeLessThan(
    client.identify.mock.invocationCallOrder[1]
  );
});

test("stale async identity sync cannot override a newer state", async () => {
  let resolve;
  const first = setup();
  const { analytics } = setup({
    loadClient: () =>
      new Promise((done) => {
        resolve = done;
      })
  });
  const old = analytics.syncAnalyticsIdentity("authenticated", 42);
  await Promise.resolve();
  const current = analytics.syncAnalyticsIdentity("anonymous");
  resolve(first.client);
  expect(await old).toBe(false);
  expect(await current).toBe(true);
  expect(first.client.identify).not.toHaveBeenCalled();
});

test("pageview is once per visit while back navigation still counts", async () => {
  const { analytics, client } = setup();
  await analytics.syncAnalyticsIdentity("anonymous");
  analytics.trackPage("/groups/123");
  analytics.trackPage("/groups/123");
  analytics.trackPage("/my");
  analytics.trackPage("/groups/123");
  expect(client.capture).toHaveBeenCalledTimes(3);
  expect(client.capture.mock.calls[0]).toEqual([
    "$pageview",
    { pathname: "/groups/:id", $pathname: "/groups/:id" }
  ]);
});

test("group pageview carries explicit group and promotion context", async () => {
  const { analytics, client } = setup();
  analytics.setAnalyticsRoute("/groups/13", {
    route_name: "GroupDetailPage",
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
  await analytics.syncAnalyticsIdentity("anonymous");

  analytics.trackPage("/groups/13");

  expect(client.capture).toHaveBeenCalledWith("$pageview", {
    pathname: "/groups/:id",
    $pathname: "/groups/:id",
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
});

test("registration_started is an allowed explicit business event", async () => {
  const { analytics, client } = setup();
  await analytics.syncAnalyticsIdentity("anonymous");

  expect(
    analytics.captureEvent("registration_started", {
      group_id: 13,
      recruitment_id: 91,
      promotion_id: "yutnori_chat_01"
    })
  ).toBe(true);
  expect(client.capture).toHaveBeenCalledWith("registration_started", {
    group_id: 13,
    recruitment_id: 91,
    promotion_id: "yutnori_chat_01"
  });
});

test("private callback prevents initialization and pauses an active recording", async () => {
  const { analytics, client } = setup();
  analytics.setAnalyticsRoute("/oauth/callback");
  expect(await analytics.syncAnalyticsIdentity("anonymous")).toBe(false);
  expect(client.init).not.toHaveBeenCalled();
  analytics.setAnalyticsRoute("/groups");
  await analytics.syncAnalyticsIdentity("anonymous");
  analytics.setAnalyticsRoute("/oauth/callback");
  analytics.captureEvent("group_created", { group_id: 1 });
  expect(client.capture).not.toHaveBeenCalled();
  expect(client.stopSessionRecording).toHaveBeenCalled();
});

test("route context is replaced on navigation and requests keep their starting context", async () => {
  const { analytics, client } = setup();
  analytics.setAnalyticsRoute("/groups/12/recruitments/34", {
    route_name: "RecruitmentDetailPage",
    group_id: "12",
    recruitment_id: "34",
    title: "private"
  });
  await analytics.syncAnalyticsIdentity("anonymous");
  expect(client.register).toHaveBeenCalledWith({
    route_name: "RecruitmentDetailPage",
    group_id: "12",
    recruitment_id: "34",
    pathname: "/groups/:id/recruitments/:id"
  });
  const pending = analytics.startRequestTracking({ endpoint: "/groups/12" });
  analytics.setAnalyticsRoute("/my", { route_name: "MyPage" });
  expect(client.unregister).toHaveBeenCalledWith("group_id");
  expect(client.unregister).toHaveBeenCalledWith("recruitment_id");
  expect(client.register).toHaveBeenLastCalledWith({ route_name: "MyPage", pathname: "/my" });
  pending.finish({ status: 200 });
  expect(client.capture).toHaveBeenCalledWith(
    "api_request_completed",
    expect.objectContaining({
      group_id: "12",
      recruitment_id: "34",
      pathname: "/groups/:id/recruitments/:id"
    })
  );
});

test("global URL guard blocks callback before React catches up", async () => {
  const { analytics, options } = setup();
  await analytics.syncAnalyticsIdentity("anonymous");
  window.history.replaceState({}, "", "/oauth/callback?code=secret");
  expect(options().before_send({ event: "$autocapture", properties: {} })).toBeNull();
});

test("signup result identifies member before capturing success", async () => {
  const { analytics, client } = setup();
  await analytics.syncAnalyticsIdentity("signup-required");
  analytics.captureEvent("signup_completed", { member_id: 42, crewName: "private" });
  expect(client.identify).toHaveBeenCalledWith("42");
  expect(client.identify.mock.invocationCallOrder[0]).toBeLessThan(
    client.capture.mock.invocationCallOrder[0]
  );
  expect(client.capture).toHaveBeenCalledWith("signup_completed", { member_id: 42 });
});

test("request timing records metadata once and drops a late response after account switch", async () => {
  const { analytics, client, tick } = setup();
  await analytics.syncAnalyticsIdentity("authenticated", 42);
  const request = analytics.startRequestTracking({
    endpoint: "/groups/123?token=secret",
    method: "GET"
  });
  tick();
  request.finish({ status: 200, outcome: "success", body: "private" });
  request.finish({ status: 200 });
  expect(client.capture).toHaveBeenCalledTimes(1);
  expect(client.capture.mock.calls[0][1]).toMatchObject({
    endpoint: "/groups/:id",
    duration_ms: 125,
    status: 200
  });
  const old = analytics.startRequestTracking({ endpoint: "/groups", method: "GET" });
  await analytics.syncAnalyticsIdentity("authenticated", 51);
  old.finish({ status: 200 });
  expect(client.capture).toHaveBeenCalledTimes(1);
});

test("SDK load failure and capture failure are isolated from app actions", async () => {
  const broken = setup({ loadClient: () => Promise.reject(new Error("unavailable")) });
  expect(await broken.analytics.syncAnalyticsIdentity("anonymous")).toBe(false);
  const { analytics, client } = setup();
  await analytics.syncAnalyticsIdentity("anonymous");
  client.capture.mockImplementation(() => {
    throw new Error("SDK failed");
  });
  expect(() => analytics.captureEvent("group_created", { group_id: 1 })).not.toThrow();
  expect(() =>
    analytics.startRequestTracking({ endpoint: "/groups" }).finish({ status: 200 })
  ).not.toThrow();
});

test("opted-out visitor remains opted out", async () => {
  const initial = setup();
  initial.client.has_opted_out_capturing.mockReturnValue(true);
  expect(await initial.analytics.syncAnalyticsIdentity("anonymous")).toBe(false);
  expect(initial.client.startSessionRecording).not.toHaveBeenCalled();
});

test("replay config explicitly masks inputs, attributes, images and disables network bodies", async () => {
  const { analytics, options } = setup();
  await analytics.syncAnalyticsIdentity("anonymous");
  expect(options().session_recording).toMatchObject({
    maskAllInputs: true,
    maskTextSelector: "*",
    maskAllElementAttributes: true,
    recordHeaders: false,
    recordBody: false,
    captureJsonLd: false,
    sampleRate: 1
  });
  expect(options().session_recording.blockSelector).toContain('input[type="file"]');
  expect(options().capture_pageview).toBe(false);
});

test("event and top-level person attribution cannot leak query, text, attributes or raw payloads", () => {
  const event = sanitizeEvent({
    event: "$autocapture",
    properties: {
      action: "registration_submit",
      member_id: 42,
      message: "private",
      $current_url: "https://example.com/groups/12?code=secret#token",
      $elements: [
        { tag_name: "button", nth_child: 2, $el_text: "private", attr__href: "?token=secret" }
      ],
      $set: { email: "private@example.com" }
    },
    $set_once: { $initial_current_url: "https://example.com/?state=secret", nickname: "private" }
  });
  const serialized = JSON.stringify(event);
  expect(serialized).not.toMatch(/private|secret|token/);
  expect(event.properties.action).toBe("registration_submit");
  expect(event.$set_once.$initial_current_url).toBe("https://example.com/");
});

test("promotion attribution accepts only the bounded identifier format", () => {
  expect(
    sanitizeEvent({
      event: "registration_started",
      properties: {
        promotion_id: "yutnori_chat_01",
        invalid_promotion: "private"
      }
    }).properties
  ).toEqual({ promotion_id: "yutnori_chat_01" });
  expect(
    sanitizeEvent({
      event: "registration_started",
      properties: { promotion_id: "13?email=private" }
    }).properties
  ).toEqual({});
});

test("heatmap URL keys and vitals attribution are sanitized while numeric measurements survive", () => {
  const event = sanitizeEvent({
    properties: {
      $heatmap_data: {
        "https://example.com/groups/1?token=secret": [
          { x: 20, y: 40, type: "click", private: "secret" }
        ]
      },
      $web_vitals_LCP_value: 120,
      $web_vitals_LCP_event: { name: "LCP", value: 120, attribution: { element: "private" } }
    }
  });
  expect(JSON.stringify(event)).not.toMatch(/secret|private/);
  expect(event.properties.$web_vitals_LCP_value).toBe(120);
  expect(Object.values(event.properties.$heatmap_data)[0][0]).toMatchObject({ x: 20, y: 40 });
});

test("network scrubber discards external signed URLs and strips same-origin payloads", () => {
  expect(
    maskNetworkRequest({ name: "https://storage.example.com/file?signature=secret" })
  ).toBeNull();
  const request = maskNetworkRequest({
    name: window.location.origin + "/api/groups/42?token=secret",
    startTime: 10,
    duration: 20,
    requestHeaders: { cookie: "secret" },
    responseBody: "private"
  });
  expect(request.name).toBe(window.location.origin + "/api/groups/:id");
  expect(JSON.stringify(request)).not.toMatch(/private|secret/);
});

test("path normalization is idempotent and removes arbitrary user-controlled segments", () => {
  expect(normalizePath(normalizePath("/groups/42?token=secret"))).toBe("/groups/:id");
  expect(normalizePath("/people/private@example.com")).toBe("/:redacted/:redacted");
  expect(isPrivateRoute("/api/oauth/github/callback")).toBe(true);
});
