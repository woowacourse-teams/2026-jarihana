import { Link, useParams, useSearchParams } from "react-router";

import { useAuth } from "../../features/auth/index.js";
import { useGroup } from "../../features/group/index.js";
import { useInfiniteGroupMembers } from "../../features/member/index.js";
import { useInfiniteRecruitments } from "../../features/recruitment/index.js";
import {
  Button,
  EmptyState,
  ErrorState,
  MarkdownContent,
  PageContainer,
  Skeleton,
  StatusBadge,
  Tabs
} from "../../shared/ui/index.js";
import {
  courseLabel,
  flattenPages,
  formatLocalDateTime,
  publicErrorCopy,
  recruitmentStatusLabel,
  scheduleText,
  statusTone,
  typeLabel
} from "./pageUtils.js";
import "./groups.css";

const tabs = [
  { label: "소개", value: "intro" },
  { label: "모집", value: "recruitments" },
  { label: "멤버", value: "members" }
];

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
              <p className="groups-eyebrow">{typeLabel(group.type)}</p>
              <h1 id="group-title">{group.name}</h1>
              <p>{group.introduction}</p>
              <h2 className="group-info-title">모임 정보</h2>
              <dl className="group-facts">
                <div>
                  <dt>모임 일정</dt>
                  <dd>{scheduleText(group)}</dd>
                </div>
                <div>
                  <dt>현재 멤버 수</dt>
                  <dd>{group.memberCount}명</dd>
                </div>
              </dl>
            </div>
            <div className="group-profile__art" aria-hidden="true">
              <div className="group-profile__figure">
                <span className="group-profile__figure-body" />
                <span className="group-profile__figure-head" />
                <span className="group-profile__figure-face" />
                <span className="group-profile__figure-accent" />
              </div>
              <strong>JARIHANA EXPLORERS</strong>
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
                  content:
                    selectedTab === "recruitments" ? <RecruitmentTab groupId={groupId} /> : null
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
            group={group}
            leader={group.leader}
            manageHref={isLeader ? `/groups/${groupId}/manage` : null}
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

function RecruitmentSummary({ group, leader, manageHref }) {
  const recruitment = group.activeRecruitment;
  if (!recruitment) {
    return (
      <section className="group-recruitment-summary group-rail-card">
        <ManageLink href={manageHref} />
        <EmptyState title="현재 진행 중인 모집이 없어요" />
        <LeaderSummary leader={leader} />
      </section>
    );
  }
  return (
    <section className="group-recruitment-summary group-rail-card">
      <ManageLink href={manageHref} />
      <StatusBadge tone="brand">모집 중</StatusBadge>
      <h2>함께할 {recruitment.capacity - recruitment.approvedCount}자리가 남았어요</h2>
      <dl>
        <div>
          <dt>모집 시작</dt>
          <dd>{formatLocalDateTime(recruitment.startsAt)}</dd>
        </div>
        <div>
          <dt>모집 마감</dt>
          <dd>{formatLocalDateTime(recruitment.endsAt)}</dd>
        </div>
      </dl>
      <Link
        className="ui-button ui-button--primary ui-button--md"
        to={`/groups/${group.id}/recruitments/${recruitment.id}`}
      >
        <span>모집 자세히 보기</span>
      </Link>
      <LeaderSummary leader={leader} />
    </section>
  );
}

function ManageLink({ href }) {
  if (!href) return null;
  return (
    <Link className="group-manage-link ui-button ui-button--secondary ui-button--md" to={href}>
      <span>모임 관리</span>
    </Link>
  );
}

function LeaderSummary({ leader }) {
  if (!leader) return null;
  return (
    <div className="group-leader">
      <p>운영자</p>
      <strong>{leader.crewName}</strong>
      <span>{leader.generation}기 크루</span>
    </div>
  );
}

function RecruitmentHistory({ groupId, items, query }) {
  if (query.isLoading) return <Skeleton className="group-list-skeleton" />;
  if (query.isError) return <ErrorState title="모집 이력을 불러오지 못했어요" />;
  if (items.length === 0) return <EmptyState title="아직 등록된 모집이 없어요" />;
  return (
    <div>
      <h2>모집 이력</h2>
      <ul className="group-record-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <StatusBadge tone={statusTone(item.recruitingStatus)}>
                {recruitmentStatusLabel(item.recruitingStatus)}
              </StatusBadge>
              <strong>{item.joinMethod === "AUTO" ? "자동 가입" : "승인 후 가입"}</strong>
              <span>
                {item.approvedCount}/{item.capacity}명
              </span>
            </div>
            <Link
              className="ui-button ui-button--tertiary ui-button--md"
              to={`/groups/${groupId}/recruitments/${item.id}`}
            >
              <span>자세히</span>
            </Link>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button pending={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          모집 더 보기
        </Button>
      )}
    </div>
  );
}

function RecruitmentTab({ groupId }) {
  const query = useInfiniteRecruitments(groupId);
  return <RecruitmentHistory groupId={groupId} items={flattenPages(query.data)} query={query} />;
}

function MemberList({ items, query }) {
  if (query.isLoading) return <Skeleton className="group-list-skeleton" />;
  if (query.isError) return <ErrorState title="멤버를 불러오지 못했어요" />;
  if (items.length === 0) return <EmptyState title="아직 함께하는 멤버가 없어요" />;
  return (
    <div>
      <h2>함께하는 멤버</h2>
      <ul className="group-member-list">
        {items.map((member) => (
          <li key={member.groupMemberId}>
            <span className="group-member-avatar" aria-hidden="true">
              {member.crewName.slice(0, 1)}
            </span>
            <div>
              <strong>{member.crewName}</strong>
              <span>
                {member.generation}기 · {courseLabel(member.course)}
              </span>
            </div>
            {member.role === "LEADER" && <StatusBadge tone="brand">운영자</StatusBadge>}
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button pending={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          멤버 더 보기
        </Button>
      )}
    </div>
  );
}

function MemberTab({ groupId }) {
  const query = useInfiniteGroupMembers(groupId);
  const items = flattenPages(query.data, (member) => member.groupMemberId);
  return <MemberList items={items} query={query} />;
}
