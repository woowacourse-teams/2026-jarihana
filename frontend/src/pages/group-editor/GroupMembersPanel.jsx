import { UsersRound } from "lucide-react";
import { useId, useState } from "react";

import { useInfiniteGroupMembers } from "../../features/member/index.js";
import { Avatar, Button, EmptyState, ErrorState, Skeleton, StatusBadge } from "../../shared/ui/index.js";

const COURSE_LABEL = {
  ANDROID: "안드로이드",
  BACKEND: "백엔드",
  FRONTEND: "프론트엔드"
};

function memberItems(data) {
  const unique = new Map();
  for (const page of data?.pages ?? []) {
    for (const member of page.items ?? []) unique.set(member.groupMemberId, member);
  }
  return [...unique.values()];
}

function cohortItems(members) {
  const counts = new Map();
  for (const member of members) {
    const generation =
      Number.isInteger(member.generation) && member.generation > 0 ? member.generation : "unknown";
    counts.set(generation, (counts.get(generation) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => {
      if (left === "unknown") return 1;
      if (right === "unknown") return -1;
      return left - right;
    })
    .map(([generation, count], index) => ({
      count,
      generation,
      label: generation === "unknown" ? "기수 미정" : `${generation}기`,
      tone: (index % 5) + 1
    }));
}

function generationLabel(generation) {
  return Number.isInteger(generation) && generation > 0 ? `${generation}기` : "기수 미정";
}

function PendingMembersPanel() {
  return (
    <section
      className="group-members-panel group-members-panel--pending"
      aria-labelledby="pending-members-title"
    >
      <UsersRound aria-hidden="true" size={40} />
      <div>
        <h2 id="pending-members-title">모임을 만든 뒤 멤버를 확인할 수 있어요</h2>
        <p>생성이 완료되면 실제 멤버와 기수 구성을 이 탭에서 바로 보여드려요.</p>
      </div>
    </section>
  );
}

function MemberInsights({ members }) {
  const tooltipBaseId = useId();
  const cohorts = cohortItems(members);

  return (
    <section className="group-members-panel" aria-labelledby="group-members-title">
      <div className="group-members-panel__member-column">
        <div className="group-members-panel__heading">
          <h2 id="group-members-title">멤버</h2>
        </div>

        <div aria-label="현재 멤버" className="group-members-panel__people" role="list">
          {members.map((member, index) => (
            <div className="group-members-panel__person" key={member.groupMemberId} role="listitem">
              <Avatar
                alt={`${member.crewName} 프로필`}
                className={`group-members-panel__avatar is-tone-${(index % 5) + 1}`}
                fallback={member.crewName.slice(0, 1)}
                size="sm"
                src={member.avatarUrl}
              />
              <span className="group-members-panel__copy">
                <span className="group-members-panel__name-row">
                  <strong>{member.crewName}</strong>
                  {member.role === "LEADER" ? <StatusBadge tone="neutral">모임장</StatusBadge> : null}
                </span>
                <small>
                  {member.memberType === "COACH"
                    ? "코치"
                    : `${generationLabel(member.generation)} · ${COURSE_LABEL[member.course] ?? member.course}`}
                </small>
              </span>
            </div>
          ))}
        </div>
      </div>

      <CohortDonut cohorts={cohorts} total={members.length} />

      <div className="group-members-panel__cohorts">
        <div className="group-members-panel__cohort-heading">
          <div>
            <h3>기수 구성</h3>
            <p>막대에 마우스를 올리거나 키보드로 이동하면 기수별 인원을 볼 수 있어요.</p>
          </div>
          <span>{cohorts[0].label}부터 참여 중</span>
        </div>
        <div className="group-members-panel__rail" aria-label="기수별 멤버 분포">
          {cohorts.map((cohort) => {
            const tooltipId = `${tooltipBaseId}-${cohort.generation}`;
            return (
              <button
                aria-describedby={tooltipId}
                aria-label={`${cohort.label} ${cohort.count}명`}
                className={`group-members-panel__segment is-tone-${cohort.tone}`}
                key={cohort.generation}
                style={{ "--cohort-size": cohort.count }}
                type="button"
              >
                <span className="group-members-panel__tooltip" id={tooltipId} role="tooltip">
                  {cohort.label} · {cohort.count}명
                </span>
              </button>
            );
          })}
        </div>
        <div className="group-members-panel__cohort-list">
          {cohorts.map((cohort) => (
            <span className={`is-tone-${cohort.tone}`} key={cohort.generation}>
              <i aria-hidden="true" /> {cohort.label} {cohort.count}명
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CohortDonut({ cohorts, total }) {
  const [hoveredCohort, setHoveredCohort] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(null);
  const activeCohort = selectedCohort ?? hoveredCohort;
  const circumference = 2 * Math.PI * 42;
  const chartSegments = cohorts.reduce(
    ({ segments, offset }, cohort) => {
      const length = (cohort.count / total) * circumference;
      return {
        offset: offset + length,
        segments: [...segments, { cohort, length, offset }]
      };
    },
    { offset: 0, segments: [] }
  ).segments;

  function toggleCohort(cohort) {
    setSelectedCohort((current) => (current?.generation === cohort.generation ? null : cohort));
  }

  return (
    <section
      aria-labelledby="group-editor-cohort-title"
      className="group-members-panel__cohort-chart"
    >
      <div className="group-members-panel__cohort-heading">
        <h3 id="group-editor-cohort-title">기수 구성</h3>
        <span>총 {total}명</span>
      </div>
      <div className="group-members-panel__chart-wrap">
        <div
          aria-label={"기수 구성 총 " + total + "명"}
          className="group-members-panel__donut"
          role="group"
        >
          <svg className="group-members-panel__donut-svg" viewBox="0 0 120 120">
            <circle
              aria-hidden="true"
              className="group-members-panel__donut-track"
              cx="60"
              cy="60"
              r="42"
            />
            {chartSegments.map(({ cohort, length, offset }) => (
              <circle
                aria-label={cohort.label + " · " + cohort.count + "명"}
                className={
                  "group-members-panel__donut-segment" +
                  (activeCohort?.generation === cohort.generation ? " is-active" : "")
                }
                cx="60"
                cy="60"
                key={cohort.generation}
                onFocus={() => setHoveredCohort(cohort)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleCohort(cohort);
                  }
                }}
                onMouseEnter={() => setHoveredCohort(cohort)}
                onMouseLeave={() => setHoveredCohort(null)}
                onPointerDown={() => toggleCohort(cohort)}
                onBlur={() => setHoveredCohort(null)}
                r="42"
                role="button"
                tabIndex="0"
                style={{
                  "--cohort-color": "var(--color-cohort-" + cohort.tone + ")",
                  strokeDasharray: length + " " + (circumference - length),
                  strokeDashoffset: -offset
                }}
              />
            ))}
          </svg>
          <div className="group-members-panel__donut-label">
            <strong>{total}명</strong>
            <span>전체 멤버</span>
          </div>
          {activeCohort ? (
            <div className="group-members-panel__donut-tooltip" role="status">
              {activeCohort.label} · {activeCohort.count}명
            </div>
          ) : null}
        </div>
        <ul className="group-members-panel__legend">
          {cohorts.map((cohort) => (
            <li key={cohort.generation}>
              <i
                aria-hidden="true"
                className={"is-tone-" + cohort.tone}
                style={{ "--cohort-color": "var(--color-cohort-" + cohort.tone + ")" }}
              />
              <span>{cohort.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LoadedMembersPanel({ groupId }) {
  const query = useInfiniteGroupMembers(groupId);
  const members = memberItems(query.data);

  if (query.isLoading) return <Skeleton aria-label="멤버 구성 불러오는 중" />;
  if (query.isError) {
    return (
      <ErrorState
        title="멤버 구성을 불러오지 못했어요"
        description="연결을 확인하고 다시 시도해 주세요."
        action={<Button onClick={() => query.refetch()}>다시 시도</Button>}
      />
    );
  }
  if (!members.length) {
    return (
      <EmptyState
        title="아직 함께하는 멤버가 없어요"
        description="첫 멤버가 합류하면 기수 구성이 표시돼요."
      />
    );
  }

  return (
    <>
      <MemberInsights members={members} />
      {query.hasNextPage ? (
        <div className="group-members-panel__more">
          <Button
            onClick={() => query.fetchNextPage()}
            pending={query.isFetchingNextPage}
            type="button"
            variant="secondary"
          >
            멤버 더 보기
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function GroupMembersPanel({ groupId }) {
  return groupId ? <LoadedMembersPanel groupId={groupId} /> : <PendingMembersPanel />;
}
