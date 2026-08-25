import { ArrowRight, CalendarDays, Crown, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { EmptyState, ErrorState, Skeleton, StatusBadge } from "../../shared/ui/index.js";
import { formatKoreanDate, GROUP_TYPE_LABELS, REGISTRATION_STATUS_LABELS } from "./accountUtils.js";
import { useInfiniteScroll } from "./useInfiniteScroll.js";

function GroupActivityRow({ group, isLeader }) {
  const isEnded = group.status === "ENDED";

  return (
    <article className="activity-row activity-row--interactive">
      <img
        alt=""
        className="activity-row__visual"
        src={group.representativeImageUrl || "/images/default-group.png"}
      />
      <div className="activity-row__body">
        <div className="activity-row__meta">
          <span className="activity-row__badges">
            {isLeader ? (
              <StatusBadge tone="brand">
                <Crown aria-hidden="true" size={13} /> 모임장
              </StatusBadge>
            ) : null}
            <StatusBadge tone={isEnded ? "neutral" : "success"}>
              {isEnded ? "모임 종료" : "활동 중"}
            </StatusBadge>
          </span>
          <span>
            <UsersRound aria-hidden="true" size={14} /> {group.memberCount}명
          </span>
        </div>
        <h3>{group.name}</h3>
        <p>{group.introduction}</p>
        <div className="activity-row__actions">
          <Link
            aria-label={`${group.name} 상세보기`}
            className="activity-row__detail"
            to={`/groups/${group.id}`}
          >
            <span className="activity-row__detail-copy">
              <span className="activity-row__detail-meta">
                {GROUP_TYPE_LABELS[group.type] ?? group.type} /{" "}
                {group.leader?.crewName ?? "리더 정보 없음"}
              </span>
              <span className="activity-row__detail-action">상세보기</span>
            </span>
            <ArrowRight aria-hidden="true" className="activity-row__arrow" size={17} />
          </Link>
          {isLeader ? (
            <Link
              aria-label={`${group.name} 모임 관리`}
              className="activity-row__manage ui-button ui-button--tertiary ui-button--sm"
              to={`/groups/${group.id}/manage`}
            >
              모임 관리
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function RegistrationActivityRow({ registration }) {
  const tone =
    registration.status === "APPROVED"
      ? "success"
      : registration.status === "REJECTED"
        ? "danger"
        : "warning";

  return (
    <article className="activity-row activity-row--interactive">
      <div aria-hidden="true" className="activity-row__visual activity-row__visual--registration">
        <CalendarDays size={32} />
      </div>
      <div className="activity-row__body">
        <div className="activity-row__meta">
          <span className="activity-row__badges">
            <StatusBadge tone={tone}>
              {REGISTRATION_STATUS_LABELS[registration.status] ?? registration.status}
            </StatusBadge>
          </span>
          <span>{formatKoreanDate(registration.registeredAt)}</span>
        </div>
        <h3>{registration.group.name}</h3>
        <p>{registration.message || "남긴 신청 메시지가 없어요."}</p>
        <div className="activity-row__actions">
          <Link
            aria-label={`${registration.group.name} 상세보기`}
            className="activity-row__detail"
            to={`/groups/${registration.group.id}`}
          >
            <span className="activity-row__detail-copy">
              <span className="activity-row__detail-meta">가입 신청</span>
              <span className="activity-row__detail-action">상세보기</span>
            </span>
            <ArrowRight aria-hidden="true" className="activity-row__arrow" size={17} />
          </Link>
        </div>
      </div>
    </article>
  );
}

const EMPTY_STATES = {
  joined: {
    title: "가입한 모임이 없습니다.",
    description: "관심 있는 모임에 가입하면 이곳에 모여요.",
    action: <Link to="/groups">모임 둘러보기</Link>
  },
  registrations: {
    title: "신청한 모임이 없습니다.",
    description: "가입을 신청하면 검토 상태를 여기에서 확인할 수 있어요.",
    action: <Link to="/groups">모임 둘러보기</Link>
  }
};

export function MyActivityBoard({ currentMemberId, items, kind, query }) {
  const emptyState = EMPTY_STATES[kind] ?? EMPTY_STATES.joined;
  const sentinelRef = useInfiniteScroll({
    hasNext: Boolean(query.hasNextPage),
    onLoadMore: () => query.fetchNextPage(),
    pending: Boolean(query.isFetchingNextPage)
  });
  const activities = items.map((item) =>
    kind === "registrations"
      ? { key: `registration-${item.id}`, registration: item }
      : { group: item, key: `${kind}-${item.id}` }
  );

  return (
    <section
      aria-labelledby={`my-groups-tab-${kind}`}
      className="activity-board"
      id="my-groups-panel"
      role="tabpanel"
    >
      {query.isLoading ? (
        <div aria-label="내 활동 불러오는 중" className="activity-board__grid" role="status">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}
      {!query.isLoading && query.isError ? (
        <ErrorState title="내 모임을 불러오지 못했어요" />
      ) : null}
      {!query.isLoading && !query.isError && activities.length ? (
        <div className="activity-board__grid">
          {activities.map((activity) =>
            kind === "registrations" ? (
              <RegistrationActivityRow key={activity.key} registration={activity.registration} />
            ) : (
              <GroupActivityRow
                group={activity.group}
                isLeader={
                  currentMemberId != null && activity.group.leader?.memberId === currentMemberId
                }
                key={activity.key}
              />
            )
          )}
          {query.isFetchingNextPage ? (
            <Skeleton aria-label="모임 더 불러오는 중" count={2} role="status" />
          ) : null}
        </div>
      ) : null}
      {!query.isLoading && !query.isError && activities.length === 0 ? (
        <EmptyState
          action={emptyState.action}
          description={emptyState.description}
          title={emptyState.title}
        />
      ) : null}
      {!query.isLoading && !query.isError && activities.length ? (
        <div className="activity-board__more" ref={sentinelRef}>
          {query.hasNextPage ? null : <span>모든 모임을 불러왔어요.</span>}
        </div>
      ) : null}
    </section>
  );
}
