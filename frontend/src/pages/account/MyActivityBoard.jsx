import { CalendarDays, Crown, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { EmptyState, ErrorState, GroupImage, Skeleton, StatusBadge } from "../../shared/ui/index.js";
import {
  formatKoreanDate,
  groupScheduleLabel,
  GROUP_TYPE_LABELS,
  REGISTRATION_STATUS_LABELS
} from "./accountUtils.js";
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
  const typeClassName = String(group.type).toLowerCase();

  return (
    <article
      className={`activity-row activity-row--${typeClassName} activity-row--interactive activity-row--ticket`}
    >
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
          <Link
            className="activity-row__link"
            data-ph-capture-attribute-action="my_group_detail_open"
            to={`/groups/${group.id}`}
          >
            {group.name}
          </Link>
        </h3>
        <p>{group.introduction}</p>
        <div className="activity-row__schedule">
          <CalendarDays aria-hidden="true" size={14} />
          <span>{groupScheduleLabel(group)}</span>
        </div>
        <div className="activity-row__foot">
          <span className="activity-row__members">
            <UsersRound aria-hidden="true" size={14} />
            <span>{group.memberCount}명</span>
          </span>
          {isLeader ? (
            <Link
              aria-label={`${group.name} 모임 관리`}
              className="activity-row__manage ui-button ui-button--tertiary ui-button--sm"
              data-ph-capture-attribute-action="my_group_manage_open"
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
          <Link
            className="activity-row__link"
            data-ph-capture-attribute-action="my_registration_detail_open"
            to={`/groups/${registration.group.id}`}
          >
            {registration.group.name}
          </Link>
        </h3>
        <p>{registration.message || "남긴 신청 메시지가 없어요."}</p>
        <div className="activity-row__foot">
          <span className="activity-row__members">
            <CalendarDays aria-hidden="true" size={14} />
            {formatKoreanDate(registration.registeredAt)} 신청
          </span>
        </div>
      </div>
    </article>
  );
}

const EMPTY_STATES = {
  registrations: {
    title: "신청한 모임이 없습니다.",
    description: "가입을 신청하면 검토 상태를 여기에서 확인할 수 있어요."
  }
};

const JOINED_SECTIONS = [
  {
    analyticsAction: "my_session_empty_explore",
    description: "가볍게 만나고 싶은 주제를 찾아보세요.",
    emptyDescription: "새로운 사람들과 한 번의 만남을 시작해 보세요.",
    emptyTitle: "가입한 같이해요가 없습니다.",
    key: "session",
    title: "같이해요",
    types: ["SESSION"]
  },
  {
    analyticsAction: "my_recurring_empty_explore",
    description: "꾸준히 함께할 동아리와 스터디를 모아봤어요.",
    emptyDescription: "관심 있는 주제를 오래 함께할 모임을 찾아보세요.",
    emptyTitle: "가입한 동아리·스터디가 없습니다.",
    key: "recurring",
    title: "동아리·스터디",
    types: ["CLUB", "STUDY"]
  }
];

function JoinedActivitySection({ currentMemberId, groups, query, section }) {
  return (
    <div
      aria-labelledby={`my-activity-section-${section.key}`}
      className={`activity-type-section activity-type-section--${section.key}`}
      role="group"
    >
      <div className="activity-type-section__heading">
        <div>
          <h3 id={`my-activity-section-${section.key}`}>{section.title}</h3>
          <p>{section.description}</p>
        </div>
        <span className="activity-type-section__count">
          {groups.length}
          {query.hasNextPage ? "+" : ""}
        </span>
      </div>
      {groups.length ? (
        <div className="activity-type-section__grid">
          {groups.map((group) => (
            <GroupActivityRow
              group={group}
              isLeader={currentMemberId != null && group.leader?.memberId === currentMemberId}
              key={group.id}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            <Link
              data-ph-capture-attribute-action={section.analyticsAction}
              to={section.key === "session" ? "/groups?type=SESSION" : "/groups"}
            >
              모임 둘러보기
            </Link>
          }
          description={section.emptyDescription}
          title={section.emptyTitle}
        />
      )}
    </div>
  );
}

function JoinedActivitySections({ currentMemberId, groups, query, sentinelRef }) {
  return (
    <>
      <div className="activity-type-sections">
        {JOINED_SECTIONS.map((section) => (
          <JoinedActivitySection
            currentMemberId={currentMemberId}
            groups={groups.filter((group) => section.types.includes(group.type))}
            key={section.key}
            query={query}
            section={section}
          />
        ))}
      </div>
      {query.isFetchingNextPage ? (
        <div aria-label="가입한 모임 더 불러오는 중" className="activity-board__loading" role="status">
          <Skeleton count={2} />
        </div>
      ) : null}
      <div className="activity-board__more" ref={sentinelRef}>
        {query.hasNextPage ? null : <span>모든 가입 모임을 불러왔어요.</span>}
      </div>
    </>
  );
}

export function MyActivityBoard({ currentMemberId, items, kind, query }) {
  const sentinelRef = useInfiniteScroll({
    hasNext: Boolean(query.hasNextPage),
    onLoadMore: () => query.fetchNextPage(),
    pending: Boolean(query.isFetchingNextPage)
  });
  const activities =
    kind === "registrations"
      ? items.map((item) => ({ key: `registration-${item.id}`, registration: item }))
      : [];
  const isJoined = kind === "joined";

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
      {!query.isLoading && !query.isError && isJoined ? (
        <JoinedActivitySections
          currentMemberId={currentMemberId}
          groups={items}
          query={query}
          sentinelRef={sentinelRef}
        />
      ) : null}
      {!query.isLoading && !query.isError && !isJoined && activities.length ? (
        <div className="activity-board__grid">
          {activities.map((activity) => (
            <RegistrationActivityRow key={activity.key} registration={activity.registration} />
          ))}
          {query.isFetchingNextPage ? (
            <Skeleton aria-label="신청한 모임 더 불러오는 중" count={2} role="status" />
          ) : null}
        </div>
      ) : null}
      {!query.isLoading && !query.isError && !isJoined && activities.length === 0 ? (
        <EmptyState
          action={<Link to="/groups">모임 둘러보기</Link>}
          description={EMPTY_STATES.registrations.description}
          title={EMPTY_STATES.registrations.title}
        />
      ) : null}
      {!query.isLoading && !query.isError && !isJoined && activities.length ? (
        <div className="activity-board__more" ref={sentinelRef}>
          {query.hasNextPage ? null : <span>모든 신청 모임을 불러왔어요.</span>}
        </div>
      ) : null}
    </section>
  );
}
