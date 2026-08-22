const storageKey = "jarihana:auth:return-target";

const isSafeReturnTarget = (target) => {
  if (
    typeof target !== "string" ||
    target.trim() !== target ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\")
  ) {
    return false;
  }

  const origin = window.location.origin;
  return new URL(target, origin).origin === origin;
};

export const storeReturnTarget = (target) => {
  if (!isSafeReturnTarget(target)) {
    sessionStorage.removeItem(storageKey);
    return false;
  }
  sessionStorage.setItem(storageKey, target);
  return true;
};

export const peekReturnTarget = () => {
  const target = sessionStorage.getItem(storageKey);
  if (!isSafeReturnTarget(target)) {
    sessionStorage.removeItem(storageKey);
    return null;
  }
  return target;
};

export const consumeReturnTarget = (fallback = "/my") => {
  const target = peekReturnTarget();
  sessionStorage.removeItem(storageKey);
  return target ?? (isSafeReturnTarget(fallback) ? fallback : "/my");
};
