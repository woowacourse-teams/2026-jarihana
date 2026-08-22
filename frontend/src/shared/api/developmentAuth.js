const storageKey = "jarihana:development-auth";

export const isDevelopmentLoginAvailable = () => process.env.NODE_ENV === "development";

export const isDevelopmentLoginEnabled = () =>
  isDevelopmentLoginAvailable() &&
  typeof window !== "undefined" &&
  window.localStorage.getItem(storageKey) === "enabled";

export const enableDevelopmentLogin = () => {
  if (!isDevelopmentLoginAvailable() || typeof window === "undefined") {
    return false;
  }
  window.localStorage.setItem(storageKey, "enabled");
  return true;
};

export const disableDevelopmentLogin = () => {
  const wasEnabled = isDevelopmentLoginEnabled();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey);
  }
  return wasEnabled;
};
