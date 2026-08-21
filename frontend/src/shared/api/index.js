import { apiClient } from "./client";

export { apiClient, createApiClient } from "./client";
export { ApiError, toUserMessage } from "./errors";
export { apiEnvelopeSchema, apiErrorBodySchema } from "./schemas";

export const apiRequest = (path, options = {}) => {
  const { skipAuthRefresh = false, ...requestOptions } = options;
  return apiClient.request(path, {
    ...requestOptions,
    authRetry: !skipAuthRefresh
  });
};
