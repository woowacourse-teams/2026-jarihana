import { getOAuthConfig } from "../../shared/config";

const randomState = () => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const cookieName = (options) => options?.cookieName ?? getOAuthConfig().cookieName;

const writeStateCookie = (state, options) => {
  const config = { ...getOAuthConfig(), ...options };
  const attributes = [
    `${config.cookieName}=${encodeURIComponent(state)}`,
    "Path=/",
    "Max-Age=600",
    "SameSite=Lax"
  ];
  if (config.cookieDomain) {
    attributes.push(`Domain=${config.cookieDomain}`);
  }
  if (typeof location !== "undefined" && location.protocol === "https:") {
    attributes.push("Secure");
  }
  document.cookie = attributes.join("; ");
};

export const readOAuthState = (options) => {
  const prefix = `${cookieName(options)}=`;
  const match = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
};

export const clearOAuthState = (options) => {
  const config = { ...getOAuthConfig(), ...options };
  const domain = config.cookieDomain ? `; Domain=${config.cookieDomain}` : "";
  document.cookie = `${config.cookieName}=; Path=/; Max-Age=0; SameSite=Lax${domain}`;
};

export const createGithubAuthorizationUrl = (options = {}) => {
  const config = { ...getOAuthConfig(), ...options };
  if (!config.clientId || !config.redirectUri) {
    throw new Error("GitHub OAuth public configuration is missing");
  }
  const state = randomState();
  writeStateCookie(state, config);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url.toString();
};
