import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { storeReturnTarget, useAuth } from "../../features/auth/index.js";
import { useInfiniteGroups } from "../../features/group/index.js";
import recruitmentEmptyIllustration from "../../shared/assets/illustrations/group-recruitment-empty.webp";
import { Button, EmptyState, ErrorState, PageContainer, Skeleton } from "../../shared/ui/index.js";
import { flattenPages, getLastPage, publicErrorCopy } from "./pageUtils.js";
import { DiscoveryGroupCard } from "./home/DiscoveryGroupCard.jsx";
import "./groups.css";
import "./home/discovery.css";

const filters = [
  { label: "전체", value: "" },
  { label: "동아리", value: "CLUB" },
  { label: "스터디", value: "STUDY" },
  { label: "같이해요", value: "SESSION" }
];

const groupTypes = new Set(filters.map((filter) => filter.value).filter(Boolean));

function isGroupRecruiting(group) {
  const recruitment = group.activeRecruitment;
  return (
    recruitment !== null &&
    recruitment !== undefined &&
    recruitment.approvedCount < recruitment.capacity
  );
}

function readGroupType(searchParams) {
  const type = searchParams.get("type") ?? "";
  return groupTypes.has(type) ? type : "";
}

export function GroupBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const type = readGroupType(searchParams);
  const groupStatus = searchParams.get("status");
  const statusFilter = groupStatus === "ENDED" ? "ENDED" : "ACTIVE";
  const requestedRecruitmentFilter = statusFilter === "ENDED" ? "" : searchParams.get("recruiting");
  const recruitmentFilter =
    requestedRecruitmentFilter === "true" || requestedRecruitmentFilter === "false"
      ? requestedRecruitmentFilter
      : "";
  const recruiting = recruitmentFilter === "" ? undefined : recruitmentFilter === "true";
  const [searchDraft, setSearchDraft] = useState({ source: keyword, value: keyword });
  const searchValue = searchDraft.source === keyword ? searchDraft.value : keyword;
  const query = useInfiniteGroups({
    keyword: keyword || undefined,
    type: type || undefined,
    status: statusFilter || undefined,
    recruiting,
    size: 12
  });
  const groups = flattenPages(query.data);
  const visibleGroups = groups.filter((group) => {
    if (recruitmentFilter === "true") return isGroupRecruiting(group);
    if (recruitmentFilter === "false") return !isGroupRecruiting(group);
    return true;
  });
  const lastPage = getLastPage(query.data);
  const errorCopy = publicErrorCopy(query.error, "모임 목록");

  function updateQuery(next) {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  function submitSearch(event) {
    event.preventDefault();
    updateQuery({ keyword: searchValue.trim() });
  }

  function updateStatusFilter(value) {
    updateQuery({
      status: value,
      recruiting: value === "ENDED" ? "" : recruitmentFilter
    });
  }

  function handleCreateGroup() {
    const target = "/groups/new";
    if (status === "anonymous") {
      storeReturnTarget(target);
      login();
      return;
    }
    navigate(target);
  }

  return (
    <PageContainer className="groups-page groups-page--browse">
      <section
        className="groups-discovery-section"
        id="groups-discovery"
        aria-labelledby="browse-groups"
      >
        <div className="groups-discovery-section__heading">
          <h1 id="browse-groups">자리 둘러보기</h1>
          <div className="groups-discovery-section__meta">
            {!query.isLoading && (
              <span aria-live="polite">{visibleGroups.length}개 자리하는 중</span>
            )}
            <Button
              className="groups-discovery-section__create-button"
              data-ph-capture-attribute-action="community_discovery_group_create"
              onClick={handleCreateGroup}
              size="sm"
            >
              모임 만들기
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Button>
          </div>
        </div>

        <div className="groups-discovery-tools-panel">
          <div className="groups-discovery-tools">
            <form
              className="groups-discovery-search"
              data-ph-capture-attribute-action="community_discovery_search_form"
              role="search"
              onSubmit={submitSearch}
            >
              <label htmlFor="group-search">모임 검색</label>
              <div className="groups-discovery-search__control">
                <input
                  id="group-search"
                  data-ph-capture-attribute-action="community_discovery_search_input"
                  type="search"
                  value={searchValue}
                  onChange={(event) =>
                    setSearchDraft({ source: keyword, value: event.target.value })
                  }
                  placeholder="모임명으로 검색하기"
                />
                <button
                  className="groups-discovery-search__submit"
                  data-ph-capture-attribute-action="community_discovery_search_submit"
                  type="submit"
                  aria-label="검색"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m15.5 15.5 5 5" />
                  </svg>
                </button>
              </div>
            </form>
            <div className="groups-discovery-filter" role="group" aria-label="모임 필터">
              <label className="groups-discovery-filter__field">
                <span className="groups-discovery-filter__label">모임 유형</span>
                <div className="groups-discovery-filter__select">
                  <select
                    data-ph-capture-attribute-action="community_discovery_type_change"
                    value={type}
                    onChange={(event) => updateQuery({ type: event.target.value })}
                  >
                    {filters.map((filter) => (
                      <option key={filter.label} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="groups-discovery-filter__field">
                <span className="groups-discovery-filter__label">모임 상태</span>
                <div className="groups-discovery-filter__select">
                  <select
                    data-ph-capture-attribute-action="community_discovery_status_change"
                    value={statusFilter}
                    onChange={(event) => updateStatusFilter(event.target.value)}
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
                    data-ph-capture-attribute-action="community_discovery_recruiting_change"
                    disabled={statusFilter === "ENDED"}
                    value={recruitmentFilter}
                    onChange={(event) => updateQuery({ recruiting: event.target.value })}
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

        {query.isLoading && (
          <div className="groups-grid groups-discovery-grid" aria-label="모임을 불러오는 중">
            {[0, 1, 2].map((item) => (
              <Skeleton className="groups-card-skeleton" key={item} />
            ))}
          </div>
        )}
        {query.isError && (
          <ErrorState
            title={errorCopy.title}
            description={errorCopy.description}
            action={
              errorCopy.retryable ? (
                <Button
                  data-ph-capture-attribute-action="community_discovery_retry"
                  onClick={() => query.refetch?.()}
                >
                  다시 시도
                </Button>
              ) : (
                <Button
                  data-ph-capture-attribute-action="community_discovery_reset_filters"
                  variant="secondary"
                  onClick={() => setSearchParams({})}
                >
                  목록 다시 보기
                </Button>
              )
            }
          />
        )}
        {!query.isLoading && !query.isError && visibleGroups.length === 0 && (
          <div className="groups-discovery-empty-state">
            <EmptyState
              description="직접 모임을 만들어보세요."
              showMark={false}
              title={null}
              visual={<img alt="" src={recruitmentEmptyIllustration} />}
            />
          </div>
        )}
        {visibleGroups.length > 0 && (
          <div
            className="groups-grid groups-discovery-grid"
            aria-busy={query.isFetching && !query.isFetchingNextPage}
          >
            {visibleGroups.map((group) => (
              <article className="discovery-group-card-frame" key={group.id}>
                <DiscoveryGroupCard group={group} recruiting={isGroupRecruiting(group)} />
              </article>
            ))}
          </div>
        )}
        {(query.hasNextPage || lastPage.hasNext) && (
          <div className="groups-discovery-more">
            <Button
              data-ph-capture-attribute-action="community_discovery_load_more"
              variant="secondary"
              pending={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              더 많은 모임 보기
            </Button>
          </div>
        )}
        {query.isFetching && !query.isLoading && !query.isFetchingNextPage && (
          <p className="groups-discovery-refresh" role="status">
            최신 모임을 확인하고 있어요.
          </p>
        )}
      </section>
    </PageContainer>
  );
}
