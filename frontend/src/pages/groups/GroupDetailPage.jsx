import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { useAuth } from "../../features/auth/index.js";
import { useGroup } from "../../features/group/index.js";
import { useInfiniteGroupMembers } from "../../features/member/index.js";
import { useCreateRegistration } from "../../features/registration/index.js";
import { toUserMessage } from "../../shared/api/index.js";
import scheduleIcon from "../../shared/assets/figma/edit-05.svg";
import placeIcon from "../../shared/assets/figma/edit-06.svg";
import memberIcon from "../../shared/assets/figma/edit-09.svg";
import kindIcon from "../../shared/assets/figma/edit-04.svg";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  GroupImage,
  MarkdownContent,
  Modal,
  PageContainer,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea
} from "../../shared/ui/index.js";
import {
  flattenPages,
  formatLocalDate,
  publicErrorCopy,
  scheduleText,
  typeLabel
} from "./pageUtils.js";
import "./groups.css";

const tabs = [
  { label: "소개", value: "intro" },
  { label: "활동 기록", value: "recruitments" },
  { label: "멤버", value: "members" }
];

function DetailFact({ icon, label, unavailable = false, value }) {
  return (
    <div className={unavailable ? "group-fact group-fact--unavailable" : "group-fact"}>
      <img alt="" aria-hidden="true" src={icon} />
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}

export function GroupDetailPage() {
  const { groupId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = tabs.some((tab) => tab.value === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "intro";
  const auth = useAuth();
  const groupQuery = useGroup(groupId);
  const group = groupQuery.data;
  const currentMember = auth.member ?? auth.user;
  const isLeader = currentMember?.id === group?.leader?.memberId;
  const isApprovedMember =
    group?.currentMemberRole === "MEMBER" || group?.currentMemberRole === "LEADER";
  const isArchived = group?.status === "ENDED";
  const isSession = group?.type === "SESSION";
  const hasSessionSchedule = isSession && Boolean(group?.sessionSchedule);

  if (groupQuery.isLoading) {
    return (
      <PageContainer className="group-detail-page">
        <Skeleton className="group-detail-skeleton" />
      </PageContainer>
    );
  }

  if (groupQuery.isError || !group) {
    const copy = publicErrorCopy(groupQuery.error, "모임");
    return (
      <PageContainer className="group-detail-page">
        <ErrorState
          title={copy.title}
          description={copy.description}
          action={
            copy.retryable ? (
              <Button onClick={() => groupQuery.refetch?.()}>다시 시도</Button>
            ) : (
              <Link className="ui-button ui-button--primary ui-button--md" to="/groups">
                <span>모임 목록으로</span>
              </Link>
            )
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="group-detail-page">
      <Link className="group-back" to="/groups">
        ← 목록으로
      </Link>
      <div className="group-detail-grid">
        <div>
          <section className="group-profile" aria-labelledby="group-title">
            <div className="group-profile__copy">
              <div className="group-profile__header">
                <p className="groups-eyebrow group-profile__type-tag">
                  <span>{typeLabel(group.type)}</span>
                </p>
                {isLeader ? (
                  <Link
                    className="group-profile__manage ui-button ui-button--secondary ui-button--md"
                    to={`/groups/${groupId}/manage`}
                  >
                    모임 관리
                  </Link>
                ) : null}
              </div>
              <h1 id="group-title">{group.name}</h1>
              <p>{group.introduction}</p>
              <div className="group-info">
                <h2 className="group-info-title">모임 정보</h2>
                <dl className="group-facts">
                  <DetailFact icon={kindIcon} label="모임 방식" unavailable value="API 미지원" />
                  <DetailFact
                    icon={scheduleIcon}
                    label="모임 일정"
                    value={
                      hasSessionSchedule ? (
                        <span className="group-facts__session-schedule">
                          <span>{formatLocalDate(group.sessionSchedule.sessionDate)}</span>
                          <span>
                            {group.sessionSchedule.startTime.slice(0, 5)} – {" "}
                            {group.sessionSchedule.endTime.slice(0, 5)}
                          </span>
                        </span>
                      ) : (
                        scheduleText(group)
                      )
                    }
                  />
                  <DetailFact icon={placeIcon} label="장소" unavailable value="API 미지원" />
                  <DetailFact
                    icon={memberIcon}
                    label="현재 멤버 수"
                    value={`${group.memberCount}명`}
                  />
                </dl>
              </div>
            </div>
            <div className="group-profile__art">
              <GroupImage
                alt={`${group.name} 대표 이미지`}
                className="group-profile__image"
                group={group}
              />
            </div>
          </section>

          <div className="group-detail-tabs">
            <Tabs
              value={selectedTab}
              onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
              items={[
                {
                  label: tabs[0].label,
                  value: tabs[0].value,
                  content: <Introduction group={group} />
                },
                {
                  label: tabs[1].label,
                  value: tabs[1].value,
                  content: <ActivityTab />
                },
                {
                  label: tabs[2].label,
                  value: tabs[2].value,
                  content: selectedTab === "members" ? <MemberTab groupId={groupId} /> : null
                }
              ]}
            />
          </div>
        </div>

        <aside className="group-rail" aria-label="모집과 운영자 정보">
          <RecruitmentSummary
            auth={auth}
            group={group}
            leader={group.leader}
            createRecruitmentHref={isLeader ? `/groups/${groupId}/manage/recruitments` : null}
            isApprovedMember={isApprovedMember}
            isArchived={isArchived}
            isLeader={isLeader}
          />
        </aside>
      </div>
    </PageContainer>
  );
}

function Introduction({ group }) {
  return (
    <div className="group-introduction">
      <h2>모임 소개</h2>
      <MarkdownContent value={group.description || group.introduction} />
    </div>
  );
}

function ActivityTab() {
  return <p className="group-tab-placeholder">추후 기능이 추가됩니다.</p>;
}

function RecruitmentSummary({
  auth,
  createRecruitmentHref,
  group,
  isApprovedMember,
  isArchived,
  isLeader,
  leader
}) {
  const recruitment = group.activeRecruitment;
  const registration = useCreateRegistration(recruitment?.id);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isAuthenticated = auth.status === "authenticated" || auth.isAuthenticated;
  const remainingSeats = recruitment
    ? Math.max(recruitment.capacity - recruitment.approvedCount, 0)
    : 0;
  const isOpen = Boolean(recruitment && remainingSeats > 0);

  if (isArchived) {
    return (
      <section className="group-recruitment-summary group-rail-card">
        <div className="group-recruitment-empty">
          <h3>아카이빙된 모임입니다</h3>
        </div>
        <LeaderSummary leader={leader} />
      </section>
    );
  }

  function openApplication() {
    registration.reset();
    setApplicationOpen(true);
  }

  function applicationAction() {
    if (!isOpen) {
      return (
        <Button disabled variant="secondary">
          모집 마감
        </Button>
      );
    }
    if (isLeader) {
      return (
        <Button disabled variant="secondary">
          운영자
        </Button>
      );
    }
    if (isApprovedMember) {
      return (
        <Button disabled variant="secondary">
          가입 완료!
        </Button>
      );
    }
    if (submitted) {
      return (
        <Button disabled variant="secondary">
          신청 완료
        </Button>
      );
    }
    if (!isAuthenticated) {
      return (
        <Button onClick={() => auth.login?.()} variant="primary">
          가입 신청하기
        </Button>
      );
    }
    return (
      <Button onClick={openApplication} variant="primary">
        가입 신청하기
      </Button>
    );
  }

  if (!recruitment) {
    return (
      <section className="group-recruitment-summary group-rail-card">
        <h2>이 모임에 자리 하나?</h2>
        <div className="group-recruitment-empty">
          <h3>현재 진행 중인 모집이 없어요</h3>
          {createRecruitmentHref ? (
            <Link
              className="group-recruitment-empty__action ui-button ui-button--primary ui-button--md"
              to={createRecruitmentHref}
            >
              새 모집 만들기
            </Link>
          ) : null}
        </div>
        <LeaderSummary leader={leader} />
      </section>
    );
  }
  return (
    <section className="group-recruitment-summary group-rail-card">
      <h2>이 모임에 자리 하나?</h2>
      <StatusBadge tone="brand">모집 중</StatusBadge>
      <dl className="group-recruitment-meta">
        <div>
          <dt>모집일정</dt>
          <dd>
            {formatLocalDate(recruitment.startsAt)} ~ {formatLocalDate(recruitment.endsAt)}
          </dd>
        </div>
        <div>
          <dt>모집 인원</dt>
          <dd>
            승인 {recruitment.approvedCount}명 / 정원 {recruitment.capacity}명
          </dd>
        </div>
      </dl>
      <div
        aria-label={`승인 ${recruitment.approvedCount}명, 정원 ${recruitment.capacity}명`}
        aria-valuemax={recruitment.capacity}
        aria-valuemin="0"
        aria-valuenow={Math.min(recruitment.approvedCount, recruitment.capacity)}
        className="group-recruitment-progress"
        role="progressbar"
      >
        <span
          style={{
            "--progress-width": `${Math.min(
              100,
              (recruitment.approvedCount / recruitment.capacity) * 100
            )}%`
          }}
        />
      </div>
      <div className="group-recruitment-action">{applicationAction()}</div>
      <LeaderSummary leader={leader} />
      <Modal
        description="운영자에게 전달할 가입 신청 메시지를 작성해 주세요."
        onClose={() => {
          if (!registration.isPending) setApplicationOpen(false);
        }}
        open={applicationOpen}
        title="가입 신청"
      >
        <ApplicationForm
          onSuccess={() => {
            setApplicationOpen(false);
            setSubmitted(true);
          }}
          registration={registration}
        />
      </Modal>
    </section>
  );
}

function ApplicationForm({ onSuccess, registration }) {
  const messageReference = useRef(null);
  const [messageLength, setMessageLength] = useState(0);

  async function submit(event) {
    event.preventDefault();
    const message = messageReference.current?.value ?? "";
    await registration.mutateAsync({ message: message.trim() || null });
    onSuccess();
  }

  return (
    <form className="group-application-form" onSubmit={submit}>
      <Textarea
        defaultValue=""
        description={`${messageLength}/1000자 · 운영자에게 전하고 싶은 내용을 적어주세요.`}
        label="가입 신청 메시지"
        maxLength={1000}
        onInput={(event) => setMessageLength(event.currentTarget.value.length)}
        ref={messageReference}
        rows={7}
      />
      {registration.error ? (
        <p className="application-error" role="alert">
          {registration.error.code
            ? toUserMessage(registration.error.code)
            : "신청을 보내지 못했어요. 다시 시도해주세요."}
        </p>
      ) : null}
      <Button pending={registration.isPending} type="submit" variant="primary">
        가입 신청하기
      </Button>
    </form>
  );
}

function LeaderSummary({ leader }) {
  if (!leader) return null;
  return (
    <div className="group-leader">
      <p>운영자</p>
      <div className="group-leader__identity">
        <Avatar
          alt={`${leader.crewName} 프로필`}
          fallback={leader.crewName.slice(0, 1)}
          src={leader.avatarUrl}
        />
        <div>
          <strong>{leader.crewName}</strong>
          <span>{leader.generation}기 크루</span>
        </div>
      </div>
    </div>
  );
}

function MemberList({ items, query }) {
  const [expanded, setExpanded] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const gridReference = useRef(null);

  useEffect(() => {
    const grid = gridReference.current;
    if (!grid) return undefined;

    const measureRows = () => {
      const rows = new Set(
        [...grid.querySelectorAll("[data-member-card]")].map((card) => card.offsetTop)
      );
      setRowCount(rows.size);
    };
    const frame = requestAnimationFrame(measureRows);
    const observer = new ResizeObserver(measureRows);
    observer.observe(grid);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [items.length]);

  if (query.isLoading) return <Skeleton className="group-list-skeleton" />;
  if (query.isError) return <ErrorState title="멤버를 불러오지 못했어요" />;
  if (items.length === 0) return <EmptyState title="아직 함께하는 멤버가 없어요" />;

  const cohorts = cohortItems(items);
  const canToggle = rowCount > 3 || query.hasNextPage || expanded;

  async function toggleMembers() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    let nextPage = query.hasNextPage;
    while (nextPage) {
      const result = await query.fetchNextPage();
      nextPage = result.hasNextPage;
    }
    setExpanded(true);
  }

  return (
    <div className="group-members-overview">
      <section aria-labelledby="group-members-title" className="group-members-list-panel">
        <h2 id="group-members-title">멤버</h2>
        <ul
          className={`group-member-grid${!expanded && rowCount > 3 ? " is-collapsed" : ""}`}
          ref={gridReference}
        >
          {items.map((member) => (
            <li data-member-card key={member.groupMemberId}>
              {member.avatarUrl ? (
                <img
                  alt={`${member.crewName} 프로필`}
                  className="group-member-avatar"
                  src={member.avatarUrl}
                />
              ) : (
                <span className="group-member-avatar" aria-hidden="true">
                  {member.crewName.slice(0, 1)}
                </span>
              )}
              <div className="group-member-card__copy">
                <div className="group-member-card__name-row">
                  <strong>{member.crewName}</strong>
                </div>
                <div className="group-member-card__meta">
                  <span>{generationLabel(member.generation)}</span>
                  {member.role === "LEADER" ? (
                    <span className="group-member-card__role">운영자</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {canToggle ? (
          <Button pending={query.isFetchingNextPage} onClick={toggleMembers}>
            {expanded ? "접기" : "더보기"}
          </Button>
        ) : null}
      </section>
      <CohortDonut cohorts={cohorts} total={items.length} />
    </div>
  );
}

function generationLabel(generation) {
  return Number.isInteger(generation) && generation > 0 ? `${generation}기` : "기수 미정";
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
    <section aria-labelledby="group-cohort-title" className="group-cohort-panel">
      <div className="group-cohort-panel__heading">
        <h3 id="group-cohort-title">기수 구성</h3>
        <span>총 {total}명</span>
      </div>
      <div className="group-cohort-panel__chart-wrap">
        <div
          aria-label={`기수 구성 총 ${total}명`}
          className="group-cohort-panel__donut"
          role="group"
        >
          <svg className="group-cohort-panel__svg" viewBox="0 0 120 120">
            <circle
              aria-hidden="true"
              className="group-cohort-panel__donut-track"
              cx="60"
              cy="60"
              r="42"
            />
            {chartSegments.map(({ cohort, length, offset }) => (
              <circle
                aria-label={`${cohort.label} · ${cohort.count}명`}
                className={`group-cohort-panel__segment${
                  activeCohort?.generation === cohort.generation ? " is-active" : ""
                }`}
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
                  "--cohort-color": `var(--color-cohort-${cohort.tone})`,
                  strokeDasharray: `${length} ${circumference - length}`,
                  strokeDashoffset: -offset
                }}
              />
            ))}
          </svg>
          <div className="group-cohort-panel__donut-label">
            <strong>{total}명</strong>
            <span>전체 멤버</span>
          </div>
          {activeCohort ? (
            <div className="group-cohort-panel__tooltip" role="status">
              {activeCohort.label} · {activeCohort.count}명
            </div>
          ) : null}
        </div>
        <ul className="group-cohort-panel__legend">
          {cohorts.map((cohort) => (
            <li key={cohort.generation}>
              <i aria-hidden="true" className={`is-tone-${cohort.tone}`} />
              <span>{cohort.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MemberTab({ groupId }) {
  const query = useInfiniteGroupMembers(groupId);
  const items = flattenPages(query.data, (member) => member.groupMemberId);
  return <MemberList items={items} query={query} />;
}
