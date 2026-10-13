import { PostHog } from "posthog-js";
import { autocapturePropertiesForElement } from "posthog-js/lib/src/autocapture";

import { sdkConfig } from "../../src/shared/analytics/config";
import { sanitizeEvent } from "../../src/shared/analytics/privacy";
import { createAnalytics } from "../../src/shared/analytics/client";

test("installed SDK keeps action and DOM positions with all text and attributes masked", () => {
  const button = document.createElement("button");
  button.textContent = "private member name";
  button.className = "private-class";
  button.setAttribute("data-ph-capture-attribute-action", "registration_submit");
  button.setAttribute("data-secret", "secret-token");
  document.body.append(button);
  try {
    const { props } = autocapturePropertiesForElement(button, {
      e: new MouseEvent("click"),
      maskAllElementAttributes: true,
      maskAllText: true,
      elementsChainAsString: true,
      disableCaptureUrlHashes: true
    });
    const event = sanitizeEvent({ event: "$autocapture", properties: props });
    expect(event.properties.action).toBe("registration_submit");
    expect(event.properties.$elements_chain).toContain('button:nth-child="1"nth-of-type="1"');
    expect(JSON.stringify(event)).not.toMatch(/private|secret/);
  } finally {
    button.remove();
  }
});

test("installed SDK identify and capture pass the sanitized required payload to before_send", async () => {
  const sdk = new PostHog();
  const events = [];
  sdk.init("phc_test", {
    ...sdkConfig({ host: "https://us.i.posthog.com" }, (event) => {
      events.push(sanitizeEvent(event));
      return null; // Inspect locally without sending any test data.
    }),
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    request_batching: false,
    persistence: "memory"
  });
  try {
    sdk.identify("42");
    sdk.capture("group_created", { group_id: 123, group_type: "SESSION", message: "private" });
    sdk.capture("invitation_joined", { group_id: 10, invitation_id: 501, invitation_type: "LINK", crewName: "private", sharePath: `/invitations/link/${"A".repeat(43)}` });
    const identity = events.find((event) => event.event === "$identify");
    expect(identity.properties).toMatchObject({ token: "phc_test", distinct_id: "42" });
    expect(identity.properties.$anon_distinct_id).toBeTruthy();
    const created = events.find((event) => event.event === "group_created");
    expect(created.properties).toMatchObject({
      distinct_id: "42",
      group_id: 123,
      group_type: "SESSION"
    });
    expect(JSON.stringify(created)).not.toContain("private");
    const joined = events.find(event => event.event === "invitation_joined");
    expect(joined.properties).toMatchObject({ distinct_id: "42", group_id: 10, invitation_id: 501, invitation_type: "LINK" });
    expect(JSON.stringify(joined)).not.toMatch(/private|invitations\/link|A{43}/);
  } finally {
    await sdk.shutdown();
  }
});

test("실제 SDK의 공유 초대 payload에는 사용자 ID와 최소 초대 정보만 남고 녹화·자동 이벤트는 전송되지 않는다", async () => {
  const sdk = new PostHog();
  const events = [];
  const initialize = sdk.init.bind(sdk);
  jest.spyOn(sdk, "init").mockImplementation((key, config) => initialize(key, {
    ...config,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    request_batching: false,
    persistence: "memory",
    before_send: event => {
      events.push({ original: event.event, sanitized: config.before_send(event) });
      return null;
    }
  }));
  const analytics = createAnalytics({
    config: { enabled: true, key: "phc_test", host: "https://us.i.posthog.com", environment: "staging" },
    loadClient: async () => sdk,
    storage: { getItem: () => null, setItem() {}, removeItem() {} }
  });
  const path = `/invitations/link/${"A".repeat(43)}`;
  window.history.replaceState({}, "", path);
  analytics.setAnalyticsRoute(path);
  try {
    await analytics.syncAnalyticsIdentity("authenticated", 42);
    sdk.register({ $current_url: path, private: "private", group_id: "A".repeat(43) });
    analytics.captureEvent("invitation_joined", { invitation_id: 501, group_id: 10, invitation_type: "LINK", name: "private", sharePath: path });
    for (const event of ["$autocapture", "$pageview", "$snapshot", "api_request_completed", "$exception"]) {
      sdk.capture(event, { $current_url: path, token: "secret-invitation-token" });
    }
    const sent = events.filter(event => event.sanitized).map(event => event.sanitized);
    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("invitation_joined");
    expect(sent[0].properties).toEqual({ token: "phc_test", distinct_id: "42", $is_identified: true, $process_person_profile: true, invitation_id: 501, group_id: 10, invitation_type: "LINK" });
    expect(JSON.stringify(sent)).not.toMatch(/A{43}|invitations\/link|secret|private|\$current_url|\$set|\$session/);
    expect(sdk.config).toMatchObject({ autocapture: false, capture_pageview: false, disable_session_recording: true, capture_exceptions: false });
    expect(sent[0].uuid).toMatch(/^[a-f\d-]{36}$/i);
  } finally {
    await sdk.shutdown();
    window.history.replaceState({}, "", "/");
  }
});
