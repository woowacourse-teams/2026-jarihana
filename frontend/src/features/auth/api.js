import { apiClient } from "../../shared/api";
import { meSchema } from "./schemas";

export const getMe = (client = apiClient, options = {}) =>
  client.request("members/me", { authRetry: options.authRetry, schema: meSchema });

export const logout = (client = apiClient) => client.request("auth/logout", { method: "POST" });

export const refreshAuth = (client = apiClient) => client.refresh();
