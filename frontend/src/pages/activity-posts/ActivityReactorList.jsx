import { formatReactorMeta } from "../../entities/activity-post/index.js";
import { Avatar, Button, Skeleton } from "../../shared/ui/index.js";
import { useInfiniteScroll } from "../account/useInfiniteScroll.js";

function ReactorSkeletons({ count, label }) {
  return (
    <div aria-label={label} className="activity-reactors__loading" role="status">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton className="activity-reactors__skeleton" key={index} />
      ))}
    </div>
  );
}

/**
 * 좋아요한 사람 전체 목록이다. 먼저 하트를 남긴 순서이고, 목록 끝에 닿으면 다음 30명을 이어서 불러온다.
 * 감시 요소가 스크롤 영역 안에 있으면 그 영역에 가려진 만큼은 보이지 않은 것으로 계산된다.
 */
export function ActivityReactorList({ emptyText, query }) {
  const reactors = query.data?.pages.flatMap((page) => page.reactors) ?? [];
  const sentinelRef = useInfiniteScroll({
    hasNext: Boolean(query.hasNextPage),
    onLoadMore: () => query.fetchNextPage(),
    pending: Boolean(query.isFetchingNextPage),
    rootMargin: "120px"
  });

  if (query.isLoading) {
    return <ReactorSkeletons count={4} label="좋아요한 사람 불러오는 중" />;
  }
  if (query.isError) {
    return (
      <div className="activity-reactors__error">
        <p>좋아요한 사람을 불러오지 못했어요.</p>
        <Button
          data-ph-capture-attribute-action="activity_reactors_retry"
          onClick={() => query.refetch()}
          size="sm"
          variant="secondary"
        >
          다시 시도
        </Button>
      </div>
    );
  }
  if (reactors.length === 0) {
    return <p className="activity-reactors__empty">{emptyText}</p>;
  }
  return (
    <div className="activity-reactors">
      <ul aria-label="좋아요한 사람" className="activity-reactors__list">
        {reactors.map((reactor, index) => (
          <li className="activity-reactor" key={`${index}-${reactor.crewName}`}>
            <Avatar
              className="activity-reactor__avatar"
              fallback={reactor.crewName.charAt(0)}
              size="sm"
              src={reactor.avatarUrl}
            />
            <span className="activity-reactor__text">
              <strong>{reactor.crewName}</strong>
              <span>{formatReactorMeta(reactor)}</span>
            </span>
            {reactor.mine ? <span className="activity-reactor__mine">나</span> : null}
          </li>
        ))}
      </ul>
      {query.isFetchingNextPage ? <ReactorSkeletons count={3} label="다음 30명을 불러오는 중" /> : null}
      <div className="activity-reactors__sentinel" ref={sentinelRef}>
        {query.hasNextPage || query.isFetchingNextPage ? null : <span>모두 확인했어요</span>}
      </div>
    </div>
  );
}
