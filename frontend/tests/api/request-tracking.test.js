/** @jest-environment node */

import { z } from "zod";
import { createApiClient } from "../../src/shared/api/client";
import { startRequestTracking } from "../../src/shared/analytics";

jest.mock("../../src/shared/analytics", () => ({ startRequestTracking: jest.fn() }));

const success = (data) => ({ data, error: null, success: true });
const failure = (code) => ({ data: null, error: { code }, success: false });
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
const memberSchema = z.object({ id: z.number() });
let attempts;

beforeEach(() => {
  jest.clearAllMocks();
  attempts = [];
  startRequestTracking.mockImplementation((metadata) => {
    const tracking = { metadata, finish: jest.fn() };
    attempts.push(tracking);
    return tracking;
  });
});

test("Given a successful mutation, when it completes, then tracking receives only request metadata", async () => {
  const client = createApiClient({
    baseUrl: "https://app.test/api/",
    cookieSource: () => "XSRF-TOKEN=private-token",
    fetch: async () => jsonResponse(success({ id: 7 }), 201)
  });

  await client.request("groups/7", {
    method: "post",
    headers: { Authorization: "Bearer private-token" },
    json: { message: "private text" },
    searchParams: { keyword: "private search" },
    schema: memberSchema
  });

  expect(attempts).toHaveLength(1);
  expect(attempts[0].metadata).toEqual({
    endpoint: "groups/7",
    method: "POST",
    logical_request_id: expect.any(String),
    attempt: 1,
    is_auth_refresh: false
  });
  expect(attempts[0].finish).toHaveBeenCalledTimes(1);
  expect(attempts[0].finish).toHaveBeenCalledWith({ status: 201, outcome: "success" });
});

test.each([
  [
    "schema mismatch",
    () => jsonResponse(success({ id: "7" })),
    200,
    "INVALID_RESPONSE",
    "invalid_response"
  ],
  [
    "malformed envelope",
    () => jsonResponse({ unexpected: true }),
    200,
    "INVALID_RESPONSE",
    "invalid_response"
  ],
  [
    "invalid JSON",
    () => new Response("not JSON", { status: 502 }),
    502,
    "INVALID_RESPONSE",
    "invalid_response"
  ],
  [
    "server rejection",
    () => jsonResponse(failure("ACCESS_DENIED"), 403),
    403,
    "ACCESS_DENIED",
    "api_error"
  ]
])(
  "Given %s, when parsing the response, then exactly one failure is recorded",
  async (_label, respond, status, code, outcome) => {
    const client = createApiClient({
      baseUrl: "https://app.test/api/",
      fetch: async () => respond()
    });

    await expect(client.request("groups/7", { schema: memberSchema })).rejects.toMatchObject({
      code
    });

    expect(attempts).toHaveLength(1);
    expect(attempts[0].finish).toHaveBeenCalledTimes(1);
    expect(attempts[0].finish).toHaveBeenCalledWith({ status, outcome, error_code: code });
  }
);

test("Given a network failure, when transport rejects, then tracking keeps the original exception", async () => {
  const networkError = new Error("private request URL and error details");
  const client = createApiClient({
    baseUrl: "https://app.test/api/",
    fetch: async () => {
      throw networkError;
    }
  });

  await expect(client.request("groups", { schema: memberSchema })).rejects.toBe(networkError);

  expect(attempts).toHaveLength(1);
  expect(attempts[0].finish).toHaveBeenCalledTimes(1);
  expect(attempts[0].finish).toHaveBeenCalledWith({
    status: 0,
    outcome: "network_error",
    error_code: "NETWORK_ERROR"
  });
});

test("HTTP failures remain failures in analytics even with a valid success envelope", async () => {
  const client = createApiClient({
    baseUrl: "https://app.test/api/",
    fetch: async () => jsonResponse(success({ id: 7 }), 500)
  });
  await expect(client.request("groups/7", { schema: memberSchema })).resolves.toEqual({ id: 7 });
  expect(attempts[0].finish).toHaveBeenCalledWith({ status: 500, outcome: "api_error" });
});

test("Given a 204 response, when no schema is supplied, then the request is recorded as successful", async () => {
  const client = createApiClient({
    baseUrl: "https://app.test/api/",
    fetch: async () => new Response(null, { status: 204 })
  });

  await expect(client.request("auth/logout", { method: "POST" })).resolves.toBeUndefined();

  expect(attempts[0].finish).toHaveBeenCalledTimes(1);
  expect(attempts[0].finish).toHaveBeenCalledWith({ status: 204, outcome: "success" });
});

test("Given an expired session, when refresh succeeds, then each attempt completes once with correlated retries", async () => {
  let memberCalls = 0;
  const client = createApiClient({
    baseUrl: "https://app.test/api/",
    fetch: async (request) => {
      if (new URL(request.url).pathname.endsWith("auth/refresh")) {
        return jsonResponse(success({ expiresIn: 900 }));
      }
      return ++memberCalls === 1
        ? jsonResponse(failure("UNAUTHENTICATED"), 401)
        : jsonResponse(success({ id: 7 }));
    }
  });

  await expect(client.request("members/me", { schema: memberSchema })).resolves.toEqual({ id: 7 });

  expect(attempts).toHaveLength(3);
  expect(
    attempts.map(({ metadata }) => [metadata.endpoint, metadata.attempt, metadata.is_auth_refresh])
  ).toEqual([
    ["members/me", 1, false],
    ["auth/refresh", 1, true],
    ["members/me", 2, false]
  ]);
  expect(attempts[2].metadata.logical_request_id).toBe(attempts[0].metadata.logical_request_id);
  expect(attempts[1].metadata.logical_request_id).not.toBe(attempts[0].metadata.logical_request_id);
  expect(attempts.map(({ finish }) => finish.mock.calls)).toEqual([
    [[{ status: 401, outcome: "api_error", error_code: "UNAUTHENTICATED" }]],
    [[{ status: 200, outcome: "success" }]],
    [[{ status: 200, outcome: "success" }]]
  ]);
});

test("Given concurrent expired requests, when refreshing, then the shared refresh is tracked only once", async () => {
  const counts = new Map();
  const client = createApiClient({
    baseUrl: "https://app.test/api/",
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("auth/refresh")) return jsonResponse(success({ expiresIn: 900 }));
      const count = counts.get(path) ?? 0;
      counts.set(path, count + 1);
      return count === 0
        ? jsonResponse(failure("UNAUTHENTICATED"), 401)
        : jsonResponse(success({ id: 7 }));
    }
  });

  await Promise.all([
    client.request("groups/7", { schema: memberSchema }),
    client.request("members/me", { schema: memberSchema })
  ]);

  expect(attempts).toHaveLength(5);
  expect(attempts.filter(({ metadata }) => metadata.is_auth_refresh)).toHaveLength(1);
  attempts.forEach(({ finish }) => expect(finish).toHaveBeenCalledTimes(1));
});

test.each([false, true])(
  "Given refresh success=%s, when authorization still fails, then no extra attempts are recorded",
  async (refreshSucceeds) => {
    const expired = jest.fn();
    const client = createApiClient({
      baseUrl: "https://app.test/api/",
      onSessionExpired: expired,
      fetch: async (request) =>
        refreshSucceeds && new URL(request.url).pathname.endsWith("auth/refresh")
          ? jsonResponse(success({ expiresIn: 900 }))
          : jsonResponse(failure("UNAUTHENTICATED"), 401)
    });

    await expect(client.request("members/me", { schema: memberSchema })).rejects.toMatchObject({
      code: "UNAUTHENTICATED"
    });

    expect(attempts).toHaveLength(refreshSucceeds ? 3 : 2);
    expect(expired).toHaveBeenCalledTimes(refreshSucceeds ? 0 : 1);
    attempts.forEach(({ finish }) => expect(finish).toHaveBeenCalledTimes(1));
  }
);
