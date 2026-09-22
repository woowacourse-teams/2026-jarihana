import { sanitizePromotionId } from "./privacy";

const STORAGE_KEY = "jarihana.analytics.promotion-attribution";
const GROUP_ID_PATTERN = /^[1-9][0-9]*$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function normalizeGroupId(value) {
  const normalized = String(value ?? "");
  return GROUP_ID_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeSessionId(value) {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value) ? value : undefined;
}

function storage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function readStoredAttribution() {
  const currentStorage = storage();
  if (!currentStorage) return undefined;
  try {
    const value = JSON.parse(currentStorage.getItem(STORAGE_KEY) || "null");
    const groupId = normalizeGroupId(value?.group_id);
    const promotionId = sanitizePromotionId(value?.promotion_id);
    const sessionId = normalizeSessionId(value?.session_id);
    if (!groupId || !promotionId || !sessionId) {
      currentStorage.removeItem(STORAGE_KEY);
      return undefined;
    }
    return { group_id: groupId, promotion_id: promotionId, session_id: sessionId };
  } catch {
    return undefined;
  }
}

export function getPromotionEntryId(search = "") {
  try {
    const values = new URLSearchParams(search).getAll("promotion_id");
    if (values.length !== 1) return undefined;
    return sanitizePromotionId(values[0]);
  } catch {
    return undefined;
  }
}

function storeAttribution(attribution) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    /* Session storage may be unavailable in private browsing. */
  }
}

export function syncPromotionAttribution(groupId, search = "", sessionId) {
  const stored = readStoredAttribution();
  const currentGroupId = normalizeGroupId(groupId);
  const currentSessionId = normalizeSessionId(sessionId);

  if (!currentSessionId) return undefined;

  // Auth/signup pages do not have a group route, so retain attribution while the
  // user completes the login flow in the same PostHog session.
  if (groupId === undefined || groupId === null || groupId === "") {
    if (stored?.session_id !== currentSessionId) {
      clearPromotionAttribution();
      return undefined;
    }
    return toPublicAttribution(stored);
  }
  if (!currentGroupId) {
    clearPromotionAttribution();
    return undefined;
  }

  if (stored && (stored.group_id !== currentGroupId || stored.session_id !== currentSessionId)) {
    clearPromotionAttribution();
  }

  const current =
    stored?.group_id === currentGroupId && stored.session_id === currentSessionId
      ? stored
      : undefined;
  if (current) return toPublicAttribution(current);

  const promotionId = getPromotionEntryId(search);
  if (!promotionId) return undefined;

  const next = {
    group_id: currentGroupId,
    promotion_id: promotionId,
    session_id: currentSessionId
  };
  storeAttribution(next);
  return toPublicAttribution(next);
}

export function getPromotionAttribution(groupId, sessionId) {
  const attribution = readStoredAttribution();
  const currentSessionId = normalizeSessionId(sessionId);
  if (!currentSessionId) return undefined;
  if (attribution?.session_id !== currentSessionId) {
    clearPromotionAttribution();
    return undefined;
  }
  return attribution?.group_id === normalizeGroupId(groupId)
    ? toPublicAttribution(attribution)
    : undefined;
}

export function clearPromotionAttribution() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* Session storage may be unavailable in private browsing. */
  }
}

function toPublicAttribution(attribution) {
  if (!attribution) return undefined;
  return {
    group_id: attribution.group_id,
    promotion_id: attribution.promotion_id
  };
}
