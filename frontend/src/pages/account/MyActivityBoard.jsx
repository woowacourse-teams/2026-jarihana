import { CalendarDays, Crown, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { EmptyState, ErrorState, GroupImage, Skeleton, StatusBadge } from "../../shared/ui/index.js";
import { formatKoreanDate, GROUP_TYPE_LABELS, REGISTRATION_STATUS_LABELS } from "./accountUtils.js";
import { useInfiniteScroll } from "./useInfiniteScroll.js";

/** 모임 종류를 노션 속성 태그처럼 값마다 다른 색으로 보여 준다. */
function GroupTypeTag({ type }) {
  return (
    <span className={`activity-tag activity-tag--${String(type).toLowerCase()}`}>
      {GROUP_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function GroupActivityRow({ group, isLeader }) {
  const isEnded = group.status === "ENDED";

  return (
    <article className="activity-row activity-row--interactive">
      <GroupImage className="activity-row__visual" group={group} />
      <div className="activity-row__body">
        <div className="activity-row__badges">
          <GroupTypeTag type={group.type} />
          {isLeader ? (
            <StatusBadge tone="brand">
              <Crown aria-hidden="true" size={13} /> 모임장
            </StatusBadge>
          ) : null}
          {isEnded ? <StatusBadge tone="neutral">모임 종료</StatusBadge> : null}
        </div>
        <h3>
          <Link className="activity-row__link" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
        </h3>
        <p>{group.introduction}</p>
        <div className="activity-row__foot">
          <span className="activity-row__members">
            <UsersRound aria-hidden="true" size={14} /> {group.memberCount}명
          </span>
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
      <GroupImage className="activity-row__visual" group={registration.group} />
      <div className="activity-row__body">
        <div className="activity-row__badges">
          <StatusBadge tone={tone}>
            {REGISTRATION_STATUS_LABELS[registration.status] ?? registration.status}
          </StatusBadge>
        </div>
        <h3>
          <Link className="activity-row__link" to={`/groups/${registration.group.id}`}>
            {registration.group.name}
          </Link>
        </h3>
        <p>{registration.message || "남긴 신청 메시지가 없어요."}</p>
        <div className="activity-row__foot">
          <span className="activity-row__members">
            <CalendarDays aria-hidden="true" size={14} />{" "}
            {formatKoreanDate(registration.registeredAt)} 신청
          </span>
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
