import { apiClient } from "../../shared/api";
import { meSchema } from "./schemas";

export const getMe = (client = apiClient, options = {}) =>
  client.request("members/me", { authRetry: options.authRetry, schema: meSchema });

export const logout = (client = apiClient, binding) => client.request("auth/logout", {
  method: "POST", ...(binding ? { json: binding } : {})
});

export const refreshAuth = (client = apiClient) => client.refresh();
