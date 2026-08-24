import ky from "ky";
import { z } from "zod";
import { getCookieValue } from "./cookies";
import { ApiError } from "./errors";
import { apiEnvelopeSchema } from "./schemas";

const refreshSchema = z.object({ expiresIn: z.number().nonnegative() }).strict();
const mutationMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

const invalidResponse = (status, details) =>
  new ApiError({ code: "INVALID_RESPONSE", details, status });

const parseResponse = async (response, schema) => {
  if (response.status === 204) {
    return undefined;
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw invalidResponse(response.status, error);
  }

  const envelope = apiEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    throw invalidResponse(response.status, envelope.error);
  }

  const { data, error, success } = envelope.data;
  if (!success || error) {
    throw new ApiError({
      code: error?.code ?? "UNKNOWN_ERROR",
      details: error?.details,
      status: response.status
    });
  }

  if (!schema) {
    throw invalidResponse(response.status, "A response schema is required");
  }

  const parsedData = schema.safeParse(data);
  if (!parsedData.success) {
    throw invalidResponse(response.status, parsedData.error);
  }
  return parsedData.data;
};

const joinUrl = (baseUrl, path) => `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export const createApiClient = ({
  baseUrl = "/api/",
  cookieSource = () => (typeof document === "undefined" ? "" : document.cookie),
  fetch: fetcher,
  onSessionExpired = () => {}
} = {}) => {
  const transport = ky.create({
    credentials: "include",
    retry: 0,
    throwHttpErrors: false,
    ...(fetcher ? { fetch: fetcher } : {})
  });
  let refreshPromise = null;
  let sessionExpiredHandler = onSessionExpired;

  const send = async (path, options = {}) => {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    if (mutationMethods.has(method)) {
      const csrfToken = getCookieValue(cookieSource(), "XSRF-TOKEN");
      if (csrfToken) {
        headers.set("X-XSRF-TOKEN", csrfToken);
      }
    }

    return transport(joinUrl(baseUrl, path), {
      headers,
      method,
      ...(options.json === undefined ? {} : { json: options.json }),
      ...(options.searchParams === undefined ? {} : { searchParams: options.searchParams })
    });
  };

  const refresh = async () => {
    const response = await send("auth/refresh", { method: "POST" });
    return parseResponse(response, refreshSchema);
  };

  const refreshOnce = () => {
    if (!refreshPromise) {
      refreshPromise = refresh()
        .catch((error) => {
          sessionExpiredHandler();
          throw error;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  };

  const request = async (path, options = {}, retryAttempted = false) => {
    const response = await send(path, options);
    try {
      return await parseResponse(response, options.schema);
    } catch (error) {
      const canRefresh =
        error instanceof ApiError &&
        error.status === 401 &&
        error.code === "UNAUTHENTICATED" &&
        options.authRetry !== false &&
        !retryAttempted;

      if (!canRefresh) {
        throw error;
      }
      await refreshOnce();
      return request(path, options, true);
    }
  };

  return Object.freeze({
    refresh,
    request,
    setSessionExpiredHandler: (handler) => {
      sessionExpiredHandler = handler;
    }
  });
};

export const apiClient = createApiClient();
