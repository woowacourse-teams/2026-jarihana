const communityTypeFilters = [
  { label: "전체", value: "" },
  { label: "동아리", value: "CLUB" },
  { label: "스터디", value: "STUDY" }
];

function actionName(kind, action) {
  return `${kind}_discovery_${action}`;
}

export function DiscoveryFilters({
  controls,
  kind,
  onSearchChange,
  onSearchSubmit,
  onUpdateQuery
}) {
  const isSession = kind === "session";
  const prefix = isSession ? "session" : "community";
  const searchId = `${prefix}-group-search`;

  return (
    <div className="groups-discovery-tools-panel">
      <div className="groups-discovery-tools">
        <form
          className="groups-discovery-search"
          data-ph-capture-attribute-action={actionName(kind, "search_form")}
          role="search"
          aria-label={isSession ? "같이해요 검색" : "스터디·동아리 검색"}
          onSubmit={onSearchSubmit}
        >
          <label htmlFor={searchId}>{isSession ? "같이해요 검색" : "스터디·동아리 검색"}</label>
          <div className="groups-discovery-search__control">
            <input
              data-ph-capture-attribute-action={actionName(kind, "search_input")}
              id={searchId}
              type="search"
              value={controls.searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={
                isSession ? "같이해요 모임명으로 검색하기" : "스터디·동아리명으로 검색하기"
              }
            />
            <button
              aria-label="검색"
              className="groups-discovery-search__submit"
              data-ph-capture-attribute-action={actionName(kind, "search_submit")}
              type="submit"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
            </button>
          </div>
        </form>
        <div
          className="groups-discovery-filter"
          role="group"
          aria-label={isSession ? "같이해요 필터" : "스터디·동아리 필터"}
        >
          {!isSession && (
            <label className="groups-discovery-filter__field">
              <span className="groups-discovery-filter__label">모임 유형</span>
              <div className="groups-discovery-filter__select">
                <select
                  data-ph-capture-attribute-action={actionName(kind, "type_change")}
                  value={controls.type}
                  onChange={(event) => onUpdateQuery({ type: event.target.value })}
                >
                  {communityTypeFilters.map((filter) => (
                    <option key={filter.label} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}
          <label className="groups-discovery-filter__field">
            <span className="groups-discovery-filter__label">모임 상태</span>
            <div className="groups-discovery-filter__select">
              <select
                data-ph-capture-attribute-action={actionName(kind, "status_change")}
                value={controls.status}
                onChange={(event) =>
                  onUpdateQuery({ [isSession ? "sessionStatus" : "status"]: event.target.value })
                }
              >
                <option value="ACTIVE">활동 중</option>
                <option value="ENDED">활동 종료</option>
              </select>
            </div>
          </label>
          <label className="groups-discovery-filter__field">
            <span className="groups-discovery-filter__label">모집 상태</span>
            <div className="groups-discovery-filter__select">
              <select
                data-ph-capture-attribute-action={actionName(kind, "recruiting_change")}
                value={controls.recruitingFilter}
                onChange={(event) =>
                  onUpdateQuery({
                    [isSession ? "sessionRecruiting" : "recruiting"]: event.target.value
                  })
                }
              >
                <option value="">전체</option>
                <option value="true">모집 중</option>
                <option value="false">모집 마감</option>
              </select>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
