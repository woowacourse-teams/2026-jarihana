import { useState } from "react";
import { Link } from "react-router";

import { useInfiniteGroups } from "../../../features/group/index.js";
import { Button, EmptyState, ErrorState, GroupImage, Skeleton } from "../../../shared/ui/index.js";
import { flattenPages, publicErrorCopy, typeLabel } from "../pageUtils.js";
import { groupScheduleLabel } from "./groupCardMetadata.js";
import "./archive-section.css";

const INITIAL_ARCHIVE_COUNT = 4;

function ArchiveCard({ group }) {
  return (
    <Link
      className="archive-card"
      data-ph-capture-attribute-action="group_view"
      to={`/groups/${group.id}`}
    >
      <GroupImage
        alt=""
        className="archive-card__image"
        group={group}
        height="160"
        loading="lazy"
        width="320"
      />
      <span aria-hidden="true" className="archive-card__scrim" />
      <span className="archive-card__badge">종료</span>
      <span className="archive-card__content">
        <span className="archive-card__type">{typeLabel(group.type)}</span>
        <h3>{group.name}</h3>
        <span className="archive-card__meta">{groupScheduleLabel(group)}</span>
        <span className="archive-card__meta">참여자 {group.memberCount}명</span>
      </span>
    </Link>
  );
}

export function ArchiveSection() {
  const query = useInfiniteGroups({ status: "ENDED", size: 8 });
  const groups = flattenPages(query.data);
  const errorCopy = publicErrorCopy(query.error, "지난 모임 아카이브");
  const [expanded, setExpanded] = useState(false);
  const visibleGroups = expanded ? groups : groups.slice(0, INITIAL_ARCHIVE_COUNT);
  const hasHiddenGroups = visibleGroups.length < groups.length;
  const canShowMore = hasHiddenGroups || query.hasNextPage;

  function showMore() {
    setExpanded(true);
    if (!hasHiddenGroups && query.hasNextPage) {
      query.fetchNextPage();
    }
  }

  return (
    <section aria-labelledby="archive-section-heading" className="archive-section">
      <div className="archive-section__heading">
        <div>
          <h2 id="archive-section-heading">지난 모임 아카이브</h2>
          <p>종료된 모임을 모아 다시 둘러볼 수 있어요.</p>
        </div>
        {canShowMore && (
          <Button
            data-ph-capture-attribute-action="archive_load_more"
            onClick={showMore}
            pending={query.isFetchingNextPage}
            size="sm"
            variant="secondary"
          >
            전체 보기
          </Button>
        )}
      </div>

      {query.isLoading && (
        <div aria-label="지난 모임 아카이브를 불러오는 중" className="archive-grid">
          {Array.from({ length: INITIAL_ARCHIVE_COUNT }, (_, item) => (
            <Skeleton className="archive-card-skeleton" key={item} />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          action={
            <Button
              data-ph-capture-attribute-action="archive_retry"
              onClick={() => query.refetch?.()}
            >
              다시 시도
            </Button>
          }
          description={errorCopy.description}
          title={errorCopy.title}
        />
      )}

      {!query.isLoading && !query.isError && groups.length === 0 && (
        <EmptyState
          description="아직 종료된 모임이 없어요. 지난 활동은 모임이 종료되면 이곳에 모일 예정이에요."
          showMark={false}
          title="지난 모임이 없어요"
        />
      )}

      {visibleGroups.length > 0 && (
        <div
          aria-busy={query.isFetching && !query.isFetchingNextPage}
          className="archive-grid"
        >
          {visibleGroups.map((group) => (
            <ArchiveCard group={group} key={group.id} />
          ))}
        </div>
      )}

      {query.isFetching && !query.isLoading && !query.isFetchingNextPage && (
        <p className="archive-section__refresh" role="status">
          지난 모임을 새로 확인하고 있어요.
        </p>
      )}
    </section>
  );
}
