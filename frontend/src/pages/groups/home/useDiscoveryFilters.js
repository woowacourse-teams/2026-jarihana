import { useState } from "react";
import { useSearchParams } from "react-router";

const DEFAULT_STATUS = "ACTIVE";
const VALID_RECRUITING_FILTERS = new Set(["true", "false"]);

function sanitizeStatus(value) {
  return value === "ENDED" ? "ENDED" : DEFAULT_STATUS;
}

function sanitizeRecruiting(value) {
  return VALID_RECRUITING_FILTERS.has(value) ? value : "";
}

function sanitizeCommunityType(value) {
  if (value === "CLUB" || value === "STUDY") return value;
  return "";
}

function isGroupRecruiting(group) {
  const recruitment = group.activeRecruitment;
  return (
    recruitment !== null &&
    recruitment !== undefined &&
    recruitment.approvedCount < recruitment.capacity
  );
}

function recruitingValueToBoolean(value) {
  if (value === "") return undefined;
  return value === "true";
}

function useSearchDraft(source) {
  const [draft, setDraft] = useState({ source, value: source });
  const value = draft.source === source ? draft.value : source;

  function updateValue(nextValue) {
    setDraft({ source, value: nextValue });
  }

  return [value, updateValue];
}

export function useDiscoveryFilters(kind) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isSession = kind === "session";
  const legacySessionLink = searchParams.get("type") === "SESSION";
  const keywordKey = isSession ? "sessionKeyword" : "keyword";
  const statusKey = isSession ? "sessionStatus" : "status";
  const recruitingKey = isSession ? "sessionRecruiting" : "recruiting";
  const dateKey = "sessionDate";

  const legacySessionKeyword = legacySessionLink ? (searchParams.get("keyword")?.trim() ?? "") : "";
  const keyword = isSession
    ? searchParams.has(keywordKey)
      ? searchParams.get(keywordKey).trim()
      : legacySessionKeyword
    : legacySessionLink
      ? ""
      : (searchParams.get(keywordKey)?.trim() ?? "");
  const status = sanitizeStatus(
    isSession && !searchParams.has(statusKey) && legacySessionLink
      ? searchParams.get("status")
      : legacySessionLink && !isSession
        ? null
        : searchParams.get(statusKey)
  );
  const recruitingFilter = sanitizeRecruiting(
    isSession && !searchParams.has(recruitingKey) && legacySessionLink
      ? searchParams.get("recruiting")
      : legacySessionLink && !isSession
        ? null
        : searchParams.get(recruitingKey)
  );
  const type = isSession ? "SESSION" : sanitizeCommunityType(searchParams.get("type"));
  const sessionDate = isSession ? (searchParams.get(dateKey)?.trim() ?? "") : "";
  const [searchValue, setSearchValue] = useSearchDraft(keyword);

  function updateQuery(next) {
    const params = new URLSearchParams(searchParams);
    if (legacySessionLink) {
      for (const [legacyKey, sessionKey] of [
        ["keyword", "sessionKeyword"],
        ["status", "sessionStatus"],
        ["recruiting", "sessionRecruiting"]
      ]) {
        if (!params.has(sessionKey) && params.has(legacyKey)) {
          params.set(sessionKey, params.get(legacyKey));
        }
        params.delete(legacyKey);
      }
      params.delete("type");
    }
    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
        return;
      }
      params.delete(key);
    });
    setSearchParams(params, { replace: true });
  }

  function submitSearch(event) {
    event.preventDefault();
    updateQuery({ [keywordKey]: searchValue.trim() });
  }

  function resetFilters() {
    const resetKeys = isSession
      ? {
          [keywordKey]: "",
          [statusKey]: "",
          [recruitingKey]: "",
          [dateKey]: ""
        }
      : {
          [keywordKey]: "",
          type: "",
          [statusKey]: "",
          [recruitingKey]: ""
        };
    updateQuery(resetKeys);
  }

  const queryFilters = {
    keyword: keyword || undefined,
    status,
    recruiting: recruitingValueToBoolean(recruitingFilter),
    size: isSession ? 6 : 12
  };

  if (isSession) {
    queryFilters.type = "SESSION";
    if (sessionDate) {
      queryFilters.sessionDate = sessionDate;
    }
  } else if (type) {
    queryFilters.type = type;
  } else {
    queryFilters.excludedType = "SESSION";
  }

  return {
    controls: {
      keyword,
      recruitingFilter,
      searchValue,
      sessionDate,
      status,
      type
    },
    isGroupRecruiting,
    queryFilters,
    resetFilters,
    setSearchValue,
    submitSearch,
    updateQuery
  };
}
