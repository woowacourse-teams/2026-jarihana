/** @jest-environment node */

import { z } from "zod";
import { ApiError, createApiClient } from "../../src/shared/api";

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });

const success = (data) => ({ data, error: null, success: true });
const failure = (code) => ({
  data: null,
  error: { code, message: "server detail must not reach users" },
  success: false
});

const createWire = (respond) => {
  const requests = [];
  return {
    fetch: async (request) => {
      requests.push(request);
      return respond(request, requests.length);
    },
    requests
  };
};

describe("API client boundary", () => {
  test("Given a success envelope, when requesting data, then it unwraps and validates data", async () => {
    // Given
    const wire = createWire(() => success({ id: 7, name: "자리하나" }));
    wire.fetch = async (request) => {
      wire.requests.push(request);
      return jsonResponse(success({ id: 7, name: "자리하나" }));
    };
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const result = await client.request("groups/7", {
      schema: z.object({ id: z.number(), name: z.string() }).strict()
    });

    // Then
    expect(result).toEqual({ id: 7, name: "자리하나" });
  });

  test("Given a malformed success payload, when requesting data, then it rejects the external shape", async () => {
    // Given
    const wire = createWire(() => jsonResponse(success({ id: "7" })));
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const action = client.request("groups/7", {
      schema: z.object({ id: z.number() }).strict()
    });

    // Then
    await expect(action).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  test("Given a 204 response, when requesting data, then it returns undefined without parsing JSON", async () => {
    // Given
    const response = new Response(null, { status: 204 });
    response.json = () => {
      throw new Error("204 response body was parsed");
    };
    const wire = createWire(() => response);
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const result = await client.request("auth/logout", { method: "POST" });

    // Then
    expect(result).toBeUndefined();
  });

  test("Given a mutation and XSRF cookie, when sending it, then credentials and CSRF header are included", async () => {
    // Given
    const wire = createWire(() => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "https://app.test/api/",
      cookieSource: () => "theme=mint; XSRF-TOKEN=token%2Bvalue",
      fetch: wire.fetch
    });

    // When
    await client.request("auth/logout", { method: "POST" });

    // Then
    expect(wire.requests[0].credentials).toBe("include");
    expect(wire.requests[0].headers.get("X-XSRF-TOKEN")).toBe("token+value");
  });

  test("Given local development login is enabled, when sending a request, then it adds the opt-in header", async () => {
    const wire = createWire(() => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "https://app.test/api/",
      developmentLoginSource: () => true,
      fetch: wire.fetch
    });

    await client.request("auth/logout", { method: "POST" });

    expect(wire.requests[0].headers.get("X-Jarihana-Development-Auth")).toBe("enabled");
  });

  test("Given an unauthenticated 401, when requesting data, then it refreshes and retries once", async () => {
    // Given
    const wire = createWire((request, count) => {
      if (new URL(request.url).pathname === "/api/auth/refresh") {
        return jsonResponse(success({ expiresIn: 900 }));
      }
      return count === 1
        ? jsonResponse(failure("UNAUTHENTICATED"), 401)
        : jsonResponse(success({ id: 7 }));
    });
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const result = await client.request("members/me", {
      schema: z.object({ id: z.number() }).strict()
    });

    // Then
    expect(result).toEqual({ id: 7 });
    expect(wire.requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/members/me",
      "/api/auth/refresh",
      "/api/members/me"
    ]);
  });

  test("Given a forbidden response, when requesting data, then it never refreshes", async () => {
    // Given
    const wire = createWire(() => jsonResponse(failure("ACCESS_DENIED"), 403));
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const action = client.request("groups/7/manage", { schema: z.unknown() });

    // Then
    await expect(action).rejects.toBeInstanceOf(ApiError);
    expect(wire.requests).toHaveLength(1);
  });

  test("Given concurrent unauthenticated responses, when requesting data, then they share one refresh", async () => {
    // Given
    let refreshCount = 0;
    const attempts = new Map();
    const wire = createWire(async (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api/auth/refresh") {
        refreshCount += 1;
        await Promise.resolve();
        return jsonResponse(success({ expiresIn: 900 }));
      }
      const count = attempts.get(pathname) ?? 0;
      attempts.set(pathname, count + 1);
      return count === 0
        ? jsonResponse(failure("UNAUTHENTICATED"), 401)
        : jsonResponse(success({ pathname }));
    });
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const results = await Promise.all([
      client.request("groups", { schema: z.object({ pathname: z.string() }) }),
      client.request("members/me", { schema: z.object({ pathname: z.string() }) })
    ]);

    // Then
    expect(results).toEqual([{ pathname: "/api/groups" }, { pathname: "/api/members/me" }]);
    expect(refreshCount).toBe(1);
  });

  test("Given the retried request is still unauthenticated, when requesting data, then it stops after one retry", async () => {
    // Given
    const wire = createWire((request) =>
      new URL(request.url).pathname === "/api/auth/refresh"
        ? jsonResponse(success({ expiresIn: 900 }))
        : jsonResponse(failure("UNAUTHENTICATED"), 401)
    );
    const client = createApiClient({ baseUrl: "https://app.test/api/", fetch: wire.fetch });

    // When
    const action = client.request("members/me", { schema: z.unknown() });

    // Then
    await expect(action).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(wire.requests).toHaveLength(3);
  });

  test("Given refresh fails, when requesting data, then it invokes the session-expired callback once", async () => {
    // Given
    const expirations = [];
    const wire = createWire(() => jsonResponse(failure("UNAUTHENTICATED"), 401));
    const client = createApiClient({
      baseUrl: "https://app.test/api/",
      fetch: wire.fetch,
      onSessionExpired: () => expirations.push("expired")
    });

    // When
    const action = client.request("members/me", { schema: z.unknown() });

    // Then
    await expect(action).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(expirations).toEqual(["expired"]);
  });
});
