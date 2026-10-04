import { useState, useSyncExternalStore } from "react";
import { useInfiniteGroups } from "../../../features/group/index.js";
import recruitmentEmptyIllustration from "../../../shared/assets/illustrations/group-recruitment-empty.webp";
import { Button, EmptyState, ErrorState, Skeleton } from "../../../shared/ui/index.js";
import { flattenPages, publicErrorCopy } from "../pageUtils.js";
import { DiscoveryFilters } from "./DiscoveryFilters.jsx";
import { DiscoveryGroupCard } from "./DiscoveryGroupCard.jsx";
import { useDiscoveryFilters } from "./useDiscoveryFilters.js";
import "./discovery.css";

const sectionCopy = {
  community: {
    description: "꾸준히 함께할 스터디와 동아리를 모아봤어요.",
    emptyDescription: "조건에 맞는 스터디·동아리가 아직 없어요.",
    errorTarget: "스터디·동아리 목록",
    heading: "스터디·동아리",
    id: "community-discovery"
  },
  session: {
    description: "가볍게 참여할 수 있는 같이해요를 먼저 확인해요.",
    emptyDescription: "조건에 맞는 같이해요가 아직 없어요.",
    errorTarget: "같이해요 목록",
    heading: "같이해요",
    id: "sessions-discovery"
  }
};

function sectionClassName(kind) {
  return `groups-discovery-section groups-discovery-section--${kind}`;
}

// Keep these boundaries aligned with the discovery grid in discovery.css.
const discoveryBreakpoints = ["(max-width: 47.9375rem)", "(max-width: 63.9375rem)"];

function subscribeToDiscoveryColumns(onChange) {
  const queries = discoveryBreakpoints.map((breakpoint) => window.matchMedia(breakpoint));
  queries.forEach((query) => query.addEventListener("change", onChange));
  return () => queries.forEach((query) => query.removeEventListener("change", onChange));
}

function getDiscoveryColumns() {
  if (window.matchMedia(discoveryBreakpoints[0]).matches) return 1;
  if (window.matchMedia(discoveryBreakpoints[1]).matches) return 3;
  return 4;
}

export function DiscoverySection({ kind, onCreateGroup }) {
  const isSession = kind === "session";
  const copy = sectionCopy[kind];
  const {
    controls,
    isGroupRecruiting,
    queryFilters,
    resetFilters,
    setSearchValue,
    submitSearch,
    updateQuery
  } = useDiscoveryFilters(kind);
  const query = useInfiniteGroups(queryFilters);
  const groups = flattenPages(query.data);
  const errorCopy = publicErrorCopy(query.error, copy.errorTarget);
  const columns = useSyncExternalStore(subscribeToDiscoveryColumns, getDiscoveryColumns, () => 4);
  const filterKey = JSON.stringify(queryFilters);
  const [preview, setPreview] = useState({ filterKey, expanded: false });

  if (preview.filterKey !== filterKey) {
    setPreview({ filterKey, expanded: false });
  }

  const visibleGroups = isSession && !preview.expanded ? groups.slice(0, columns) : groups;
  const hasHiddenGroups = visibleGroups.length < groups.length;

  function showMore() {
    setPreview({ filterKey, expanded: true });
    if (!hasHiddenGroups && query.hasNextPage) {
      query.fetchNextPage();
    }
  }

  return (
    <section aria-labelledby={`${copy.id}-heading`} className={sectionClassName(kind)} id={copy.id}>
      <div className="groups-discovery-section__heading">
        <div>
          <h2 id={`${copy.id}-heading`}>{copy.heading}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="groups-discovery-section__meta">
          {!query.isLoading && (
            <span aria-live="polite">
              {groups.length}
              {query.hasNextPage ? "+" : ""}개의 {isSession ? "자리" : "모임"}
            </span>
          )}
          {onCreateGroup && (
            <Button
              className="groups-discovery-section__create-button"
              data-ph-capture-attribute-action={`${kind}_discovery_group_create`}
              onClick={() => onCreateGroup(isSession ? "SESSION" : undefined)}
              size="sm"
            >
              {isSession ? "같이해요 만들기" : "모임 만들기"}
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      <DiscoveryFilters
        controls={controls}
        kind={kind}
        onSearchChange={setSearchValue}
        onSearchSubmit={submitSearch}
        onUpdateQuery={updateQuery}
      />

      {query.isLoading && (
        <div
          className="groups-grid groups-discovery-grid"
          aria-label={`${copy.heading}를 불러오는 중`}
        >
          {Array.from({ length: isSession ? columns : 3 }, (_, item) => (
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
                data-ph-capture-attribute-action={`${kind}_discovery_retry`}
                onClick={() => query.refetch?.()}
              >
                다시 시도
              </Button>
            ) : (
              <Button
                data-ph-capture-attribute-action={`${kind}_discovery_reset_filters`}
                variant="secondary"
                onClick={resetFilters}
              >
                목록 다시 보기
              </Button>
            )
          }
        />
      )}
      {!query.isLoading && !query.isError && groups.length === 0 && (
        <div className="groups-discovery-empty-state">
          <EmptyState
            description={copy.emptyDescription}
            showMark={false}
            title={null}
            visual={<img alt="" src={recruitmentEmptyIllustration} />}
          />
        </div>
      )}
      {groups.length > 0 && (
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
      {(hasHiddenGroups || query.hasNextPage) && (
        <div className="groups-discovery-more">
          <Button
            data-ph-capture-attribute-action={`${kind}_discovery_load_more`}
            variant="secondary"
            pending={query.isFetchingNextPage}
            onClick={showMore}
          >
            더 많은 {isSession ? "같이해요" : "모임"} 보기
          </Button>
        </div>
      )}
      {query.isFetching && !query.isLoading && !query.isFetchingNextPage && (
        <p className="groups-discovery-refresh" role="status">
          최신 목록을 확인하고 있어요.
        </p>
      )}
    </section>
  );
}
