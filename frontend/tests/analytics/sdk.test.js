import { PostHog } from "posthog-js";
import { autocapturePropertiesForElement } from "posthog-js/lib/src/autocapture";

import { sdkConfig } from "../../src/shared/analytics/config";
import { sanitizeEvent } from "../../src/shared/analytics/privacy";

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
  } finally {
    await sdk.shutdown();
  }
});
