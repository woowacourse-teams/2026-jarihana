import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { Button, EmptyState, ErrorState, Skeleton, StatusBadge } from "../../shared/ui/index.js";
import { formatKoreanDate, GROUP_TYPE_LABELS, REGISTRATION_STATUS_LABELS } from "./accountUtils.js";

function GroupActivityRow({ group, label }) {
  return (
    <Link
      aria-label={`${group.name} 모임 상세 보기`}
      className="activity-row activity-row--interactive"
      to={`/groups/${group.id}`}
    >
      <img
        alt=""
        className="activity-row__visual"
        src={group.representativeImageUrl || "/images/default-group.png"}
      />
      <div className="activity-row__body">
        <div className="activity-row__meta">
          <StatusBadge tone="brand">{label}</StatusBadge>
          <span>
            <UsersRound aria-hidden="true" size={14} /> {group.memberCount}명
          </span>
        </div>
        <h3>{group.name}</h3>
        <p>{group.introduction}</p>
        <span className="activity-row__detail">
          <span>
            {GROUP_TYPE_LABELS[group.type] ?? group.type} ·{" "}
            {group.leader?.crewName ?? "리더 정보 없음"}
          </span>
          <ArrowRight aria-hidden="true" className="activity-row__arrow" size={17} />
        </span>
      </div>
    </Link>
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
    <Link
      aria-label={`${registration.group.name} 신청 모임 상세 보기`}
      className="activity-row activity-row--interactive"
      to={`/groups/${registration.group.id}`}
    >
      <div aria-hidden="true" className="activity-row__visual activity-row__visual--registration">
        <CalendarDays size={32} />
      </div>
      <div className="activity-row__body">
        <div className="activity-row__meta">
          <StatusBadge tone={tone}>
            {REGISTRATION_STATUS_LABELS[registration.status] ?? registration.status}
          </StatusBadge>
          <span>{formatKoreanDate(registration.registeredAt)}</span>
        </div>
        <h3>{registration.group.name}</h3>
        <p>{registration.message || "남긴 신청 메시지가 없어요."}</p>
        <span className="activity-row__detail">
          <span>가입 신청</span>
          <ArrowRight aria-hidden="true" className="activity-row__arrow" size={17} />
        </span>
      </div>
    </Link>
  );
}

const EMPTY_TITLES = {
  joined: "가입한 모임이 없습니다.",
  registrations: "신청한 모임이 없습니다.",
  led: "운영하는 모임이 없습니다."
};

export function MyActivityBoard({ items, kind, query }) {
  const page = query.data?.pages.length ?? 1;
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
                key={activity.key}
                label={kind === "led" ? "운영 중" : "가입 완료"}
              />
            )
          )}
        </div>
      ) : null}
      {!query.isLoading && !query.isError && activities.length === 0 ? (
        <EmptyState title={EMPTY_TITLES[kind]} />
      ) : null}
      <nav aria-label="내 활동 페이지" className="activity-board__pagination">
        <Button aria-label="이전 활동 페이지" disabled size="sm" variant="tertiary">
          <ChevronLeft aria-hidden="true" size={18} />
        </Button>
        <span aria-current="page">{page}</span>
        <Button
          aria-label="다음 활동 불러오기"
          disabled={!query.hasNextPage}
          onClick={() => query.fetchNextPage()}
          pending={query.isFetchingNextPage}
          size="sm"
          variant="tertiary"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </Button>
      </nav>
    </section>
  );
}
