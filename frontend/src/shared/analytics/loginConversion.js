const storageKey = "jarihana:analytics:login-attempt";
const lifetimeMs = 10 * 60 * 1000;

function readAttempt() {
  const attempt = JSON.parse(sessionStorage.getItem(storageKey));
  if (
    !attempt ||
    !Number.isFinite(attempt.startedAt) ||
    Date.now() < attempt.startedAt ||
    Date.now() - attempt.startedAt > lifetimeMs
  ) {
    sessionStorage.removeItem(storageKey);
    return null;
  }
  return attempt;
}

export function beginLoginAttempt() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ startedAt: Date.now(), memberId: null }));
  } catch {
    // Analytics storage must not prevent OAuth navigation.
  }
}

export function finishLoginAttempt(status, memberId) {
  try {
    const attempt = readAttempt();
    if (!attempt) return;
    if (status !== "authenticated" || !["string", "number"].includes(typeof memberId)) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    sessionStorage.setItem(storageKey, JSON.stringify({ ...attempt, memberId: String(memberId) }));
  } catch {
    // Login remains available when analytics storage is blocked.
  }
}

export function consumeLoginCompletion(memberId) {
  try {
    const attempt = readAttempt();
    if (!attempt || attempt.memberId === null) return false;
    sessionStorage.removeItem(storageKey);
    return attempt.memberId === String(memberId);
  } catch {
    return false;
  }
}
