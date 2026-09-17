import { sanitizePromotionId } from "./privacy";

const STORAGE_KEY = "jarihana.analytics.promotion-attribution";
const GROUP_ID_PATTERN = /^[1-9][0-9]*$/;

function normalizeGroupId(value) {
  const normalized = String(value ?? "");
  return GROUP_ID_PATTERN.test(normalized) ? normalized : undefined;
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
    if (!groupId || !promotionId) {
      currentStorage.removeItem(STORAGE_KEY);
      return undefined;
    }
    return { group_id: groupId, promotion_id: promotionId };
  } catch {
    return undefined;
  }
}

function readPromotionId(search = "") {
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

export function syncPromotionAttribution(groupId, search = "") {
  const stored = readStoredAttribution();
  const currentGroupId = normalizeGroupId(groupId);

  // Auth/signup pages do not have a group route, so retain attribution while the
  // user completes the login flow in the same browser tab.
  if (groupId === undefined || groupId === null || groupId === "") return stored;
  if (!currentGroupId) {
    clearPromotionAttribution();
    return undefined;
  }

  if (stored && stored.group_id !== currentGroupId) {
    try {
      storage()?.removeItem(STORAGE_KEY);
    } catch {
      /* Session storage may be unavailable in private browsing. */
    }
  }

  const current = stored?.group_id === currentGroupId ? stored : undefined;
  if (current) return current;

  const promotionId = readPromotionId(search);
  if (!promotionId) return undefined;

  const next = { group_id: currentGroupId, promotion_id: promotionId };
  storeAttribution(next);
  return next;
}

export function getPromotionAttribution(groupId) {
  const attribution = readStoredAttribution();
  return attribution?.group_id === normalizeGroupId(groupId) ? attribution : undefined;
}

export function clearPromotionAttribution() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* Session storage may be unavailable in private browsing. */
  }
}
