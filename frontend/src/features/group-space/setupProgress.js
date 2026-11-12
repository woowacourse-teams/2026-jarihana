const storageKey = (groupId, memberId) => `jarihana:clubhouse-setup:${memberId}:${groupId}`;

export function rememberPendingClubhouseSetup(groupId, memberId) {
  if (!memberId) return false;
  try {
    window.localStorage.setItem(storageKey(groupId, memberId), "pending");
    return true;
  } catch {
    return false;
  }
}

export function hasPendingClubhouseSetup(groupId, memberId) {
  if (!memberId) return false;
  try {
    return window.localStorage.getItem(storageKey(groupId, memberId)) === "pending";
  } catch {
    return false;
  }
}

export function clearPendingClubhouseSetup(groupId, memberId) {
  try {
    window.localStorage.removeItem(storageKey(groupId, memberId));
  } catch {
    // Storage can be disabled while the user is on the page.
  }
}
