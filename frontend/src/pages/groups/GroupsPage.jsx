import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useInfiniteGroups } from "../../features/group/index.js";
import {
  Button,
  EmptyState,
  ErrorState,
  GroupCard,
  PageContainer,
  Skeleton
} from "../../shared/ui/index.js";
import { flattenPages, getLastPage, publicErrorCopy } from "./pageUtils.js";
import "./groups.css";

const filters = [
  { label: "전체", value: "" },
  { label: "동아리", value: "CLUB" },
  { label: "스터디", value: "STUDY" },
  { label: "세션", value: "SESSION" }
];

export function GroupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const type = searchParams.get("type") ?? "";
  const groupStatus = searchParams.get("status");
  const statusFilter = groupStatus === "ENDED" ? "ENDED" : "ACTIVE";
  const [searchDraft, setSearchDraft] = useState({ source: keyword, value: keyword });
  const searchValue = searchDraft.source === keyword ? searchDraft.value : keyword;
  const query = useInfiniteGroups({
    keyword: keyword || undefined,
    type: type || undefined,
    status: statusFilter || undefined,
    size: 12
  });
  const groups = flattenPages(query.data);
  const lastPage = getLastPage(query.data);
  const errorCopy = publicErrorCopy(query.error, "모임 목록");

  function updateQuery(next) {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    setSearchParams(params, { replace: true });
  }

  function submitSearch(event) {
    event.preventDefault();
    updateQuery({ keyword: searchValue.trim() });
  }

  function updateStatusFilter(value) {
    updateQuery({
      recruiting: "",
      status: value
    });
  }

  return (
    <PageContainer className="groups-page">
      <section className="groups-hero" aria-labelledby="groups-title">
        <div className="groups-hero__copy">
          <h1 id="groups-title" aria-label="크루와 함께할 자리를 찾아보세요">
            <span aria-hidden="true">크루와</span>
            <span aria-hidden="true">함께할 자리를</span>
            <span aria-hidden="true">찾아보세요</span>
          </h1>
          <p>관심사와 맞는 모임을 발견해보세요.</p>
        </div>
        <div className="groups-hero__art" role="img" aria-label="함께 탐험하는 크루 일러스트"></div>
      </section>

      <section className="groups-discovery" aria-labelledby="recommended-groups">
        <div className="groups-result-heading">
          <h1 id="recommended-groups">자리 둘러보기</h1>
          <div className="groups-result-meta">
            {!query.isLoading && <span aria-live="polite">{groups.length}개 자리하는 중</span>}
          </div>
        </div>

        <div className="groups-tools-panel">
          <div className="groups-tools">
            <form className="groups-search" role="search" onSubmit={submitSearch}>
              <label htmlFor="group-search">모임 검색</label>
              <div className="groups-search__control">
                <input
                  id="group-search"
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchDraft({ source: keyword, value: event.target.value })}
                  placeholder="모임명으로 검색하기"
                />
                <button className="groups-search__submit" type="submit" aria-label="검색">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m15.5 15.5 5 5" />
                  </svg>
                </button>
              </div>
            </form>
            <div className="groups-filter" role="group" aria-label="모임 필터">
              <label className="groups-filter__field">
                <span className="groups-filter__label">모임 유형</span>
                <div className="groups-filter__select">
                  <select value={type} onChange={(event) => updateQuery({ type: event.target.value })}>
                    {filters.map((filter) => (
                      <option key={filter.label} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="groups-filter__field">
                <span className="groups-filter__label">모임 상태</span>
                <div className="groups-filter__select">
                  <select value={statusFilter} onChange={(event) => updateStatusFilter(event.target.value)}>
                    <option value="ACTIVE">활동 중</option>
                    <option value="ENDED">활동 종료</option>
                  </select>
                </div>
              </label>
            </div>
          </div>
        </div>

        {query.isLoading && (
          <div className="groups-grid" aria-label="모임을 불러오는 중">
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
                <Button onClick={() => query.refetch?.()}>다시 시도</Button>
              ) : (
                <Button variant="secondary" onClick={() => setSearchParams({})}>
                  목록 다시 보기
                </Button>
              )
            }
          />
        )}
        {!query.isLoading && !query.isError && groups.length === 0 && (
          <EmptyState
            title="조건에 맞는 모임이 아직 없어요"
            description="검색어를 줄이거나 다른 유형을 선택해보세요."
            action={
              <Button variant="secondary" onClick={() => setSearchParams({})}>
                필터 초기화
              </Button>
            }
          />
        )}
        {groups.length > 0 && (
          <div className="groups-grid" aria-busy={query.isFetching && !query.isFetchingNextPage}>
            {groups.map((group) => (
              <article className="groups-card-frame" key={group.id}>
                <GroupCard
                  as={Link}
                  href={`/groups/${group.id}`}
                  group={{
                    ...group,
                    recruiting:
                      group.activeRecruitment !== null &&
                      group.activeRecruitment !== undefined &&
                      group.activeRecruitment.approvedCount < group.activeRecruitment.capacity
                  }}
                  showScheduleMeta
                />
              </article>
            ))}
          </div>
        )}
        {(query.hasNextPage || lastPage.hasNext) && (
          <div className="groups-more">
            <Button
              variant="secondary"
              pending={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              더 많은 모임 보기
            </Button>
          </div>
        )}
        {query.isFetching && !query.isLoading && !query.isFetchingNextPage && (
          <p className="groups-refresh" role="status">
            최신 모임을 확인하고 있어요.
          </p>
        )}
      </section>
    </PageContainer>
  );
}
