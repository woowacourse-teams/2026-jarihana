import { useState } from "react";

import { useAuth } from "../../features/auth/index.js";
import { useInfiniteGroups } from "../../features/group/index.js";
import { useInfiniteMyRegistrations } from "../../features/registration/index.js";
import { Card, Skeleton } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";
import { MyActivityBoard } from "./MyActivityBoard.jsx";
import { COURSE_LABELS, flattenPages } from "./accountUtils.js";

function mergeGroupQueries(activeQuery, archivedQuery) {
  const groups = new Map();
  [...flattenPages(activeQuery.data), ...flattenPages(archivedQuery.data)].forEach((group) => {
    groups.set(group.id, group);
  });
  const pageCount = Math.max(
    activeQuery.data?.pages.length ?? 0,
    archivedQuery.data?.pages.length ?? 0,
    1
  );

  return {
    data: { pages: Array.from({ length: pageCount }, () => ({})) },
    fetchNextPage: () =>
      Promise.all([
        activeQuery.hasNextPage ? activeQuery.fetchNextPage() : null,
        archivedQuery.hasNextPage ? archivedQuery.fetchNextPage() : null
      ]),
    hasNextPage: Boolean(activeQuery.hasNextPage || archivedQuery.hasNextPage),
    isError: activeQuery.isError || archivedQuery.isError,
    isFetchingNextPage: activeQuery.isFetchingNextPage || archivedQuery.isFetchingNextPage,
    isLoading: activeQuery.isLoading || archivedQuery.isLoading,
    items: [...groups.values()]
  };
}

function ProfileAvatar({ member }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!member.avatarUrl || imageFailed) {
    return (
      <div
        aria-label={`${member.crewName} 기본 프로필`}
        className="profile-card__avatar profile-card__avatar--fallback"
        role="img"
      >
        <span aria-hidden="true">{member.crewName.slice(0, 1)}</span>
      </div>
    );
  }

  return (
    <img
      alt={`${member.crewName} 프로필`}
      className="profile-card__avatar"
      onError={() => setImageFailed(true)}
      src={member.avatarUrl}
    />
  );
}

export function MyPage() {
  const { member } = useAuth();
  const [activeGroupTab, setActiveGroupTab] = useState("joined");
  const joinedQuery = useInfiniteGroups({ relation: "JOINED" });
  const ledActiveQuery = useInfiniteGroups({ relation: "JOINED", role: "LEADER" });
  const ledArchivedQuery = useInfiniteGroups({
    relation: "JOINED",
    role: "LEADER",
    status: "ENDED"
  });
  const registrationQuery = useInfiniteMyRegistrations({ applicant: "me" });
  const joined = flattenPages(joinedQuery.data);
  const ledQuery = mergeGroupQueries(ledActiveQuery, ledArchivedQuery);
  const led = ledQuery.items;
  const registrations = flattenPages(registrationQuery.data);
  const joinedCount = `${joined.length}${joinedQuery.hasNextPage ? "+" : ""}`;
  const ledCount = `${led.length}${ledQuery.hasNextPage ? "+" : ""}`;
  const registrationCount = `${registrations.length}${registrationQuery.hasNextPage ? "+" : ""}`;
  const groupTabs = [
    {
      id: "joined",
      label: "가입한 모임",
      count: joinedCount,
      items: joined,
      query: joinedQuery
    },
    {
      id: "registrations",
      label: "신청한 모임",
      count: registrationCount,
      items: registrations,
      query: registrationQuery
    },
    {
      id: "led",
      label: "운영하는 모임",
      count: ledCount,
      items: led,
      query: ledQuery
    }
  ];
  const activeGroup = groupTabs.find((tab) => tab.id === activeGroupTab) ?? groupTabs[0];

  if (!member) {
    return (
      <AccountLayout title="내 자리">
        <Skeleton className="profile-skeleton" />
      </AccountLayout>
    );
  }

  return (
    <AccountLayout
      title="마이페이지"
      description="신청 · 가입 · 운영 중인 모임과 내가 남긴 활동 흔적을 확인하세요."
    >
      <div className="my-dashboard">
        <aside className="profile-column">
          <Card as="section" className="profile-card">
            <p className="account-eyebrow">나의 프로필</p>
            <ProfileAvatar member={member} />
            <h2>{member.crewName}</h2>
            <p>
              {member.generation}기 · {COURSE_LABELS[member.course] ?? member.course}
            </p>
            <p className="profile-card__note">현재 프로필은 읽기 전용이에요.</p>
          </Card>
          <div aria-hidden="true" className="profile-companion" />
        </aside>
        <Card as="section" className="dashboard-panel">
          <h2>내 모임</h2>
          <div aria-label="내 모임 분류" className="dashboard-counts" role="tablist">
            {groupTabs.map((tab) => (
              <button
                aria-controls="my-groups-panel"
                aria-selected={activeGroupTab === tab.id}
                id={`my-groups-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveGroupTab(tab.id)}
                role="tab"
                type="button"
              >
                <strong>{tab.count}</strong>
                <span className="dashboard-counts__label">{tab.label}</span>
              </button>
            ))}
          </div>
          <MyActivityBoard
            items={activeGroup.items}
            kind={activeGroup.id}
            query={activeGroup.query}
          />
        </Card>
      </div>
    </AccountLayout>
  );
}
