import { useState } from "react";
import { Link } from "react-router";

import { useAuth } from "../../features/auth/index.js";
import { useInfiniteGroups } from "../../features/group/index.js";
import { useInfiniteMyRegistrations } from "../../features/registration/index.js";
import { Card, Skeleton } from "../../shared/ui/index.js";
import { AccountLayout } from "./AccountLayout.jsx";
import { MyActivityBoard } from "./MyActivityBoard.jsx";
import {
  flattenPages,
  memberMetaLabel,
  REGISTRATION_TAB_LABELS
} from "./accountUtils.js";

const GROUP_TYPE_TABS = [
  {
    id: "session",
    label: "같이해요",
    types: ["SESSION"],
    emptyState: {
      title: "가입한 같이해요가 없습니다.",
      description: "자리하나?",
      action: (
        <Link
          data-ph-capture-attribute-action="my_session_empty_explore"
          to="/groups?type=SESSION"
        >
          모임 둘러보기
        </Link>
      )
    }
  },
  {
    id: "recurring",
    label: "동아리·스터디",
    types: ["CLUB", "STUDY"],
    emptyState: {
      title: "가입한 동아리·스터디가 없습니다.",
      description: "관심 있는 주제를 오래 함께할 모임을 찾아보세요.",
      action: (
        <Link
          data-ph-capture-attribute-action="my_recurring_empty_explore"
          to="/groups"
        >
          모임 둘러보기
        </Link>
      )
    }
  }
];

const REGISTRATION_TABS = [
  {
    id: "pending",
    status: "PENDING",
    label: REGISTRATION_TAB_LABELS.PENDING,
    emptyState: {
      title: "검토 중인 신청이 없습니다.",
      description: "가입을 신청하면 검토 상태를 여기에서 확인할 수 있어요.",
      action: (
        <Link
          data-ph-capture-attribute-action="my_pending_registration_empty_explore"
          to="/groups"
        >
          모임 둘러보기
        </Link>
      )
    }
  },
  {
    id: "rejected",
    status: "REJECTED",
    label: REGISTRATION_TAB_LABELS.REJECTED,
    emptyState: {
      title: "미승인 신청이 없습니다.",
      description: "미승인 신청이 생기면 이곳에서 확인할 수 있어요.",
      action: (
        <Link
          data-ph-capture-attribute-action="my_rejected_registration_empty_explore"
          to="/groups"
        >
          모임 둘러보기
        </Link>
      )
    }
  }
];

function groupTypeTabFromQuery() {
  const requestedType = new URLSearchParams(window.location.search).get("groupType");
  if (requestedType === "SESSION") return "session";
  if (requestedType === "CLUB" || requestedType === "STUDY") return "recurring";
  return "session";
}

function registrationTabFromQuery() {
  const requestedStatus = new URLSearchParams(window.location.search).get("registrationStatus");
  return requestedStatus === "REJECTED" ? "rejected" : "pending";
}

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
  const [activeGroupTypeTab, setActiveGroupTypeTab] = useState(groupTypeTabFromQuery);
  const [activeRegistrationTab, setActiveRegistrationTab] = useState(registrationTabFromQuery);
  const joinedActiveQuery = useInfiniteGroups({ relation: "JOINED" });
  const joinedEndedQuery = useInfiniteGroups({ relation: "JOINED", status: "ENDED" });
  const pendingRegistrationQuery = useInfiniteMyRegistrations({
    applicant: "me",
    status: "PENDING"
  });
  const rejectedRegistrationQuery = useInfiniteMyRegistrations({
    applicant: "me",
    status: "REJECTED"
  });
  const joinedQuery = mergeGroupQueries(joinedActiveQuery, joinedEndedQuery);
  const joined = joinedQuery.items;
  const groupTabs = GROUP_TYPE_TABS.map((tab) => {
    const items = joined.filter((group) => tab.types.includes(group.type));
    return {
      ...tab,
      count: `${items.length}${joinedQuery.hasNextPage ? "+" : ""}`,
      items,
      query: joinedQuery
    };
  });
  const registrationTabs = REGISTRATION_TABS.map((tab) => {
    const query =
      tab.status === "PENDING" ? pendingRegistrationQuery : rejectedRegistrationQuery;
    const items = flattenPages(query.data);
    return {
      ...tab,
      count: `${items.length}${query.hasNextPage ? "+" : ""}`,
      items,
      query
    };
  });
  const activeGroup =
    groupTabs.find((tab) => tab.id === activeGroupTypeTab) ?? groupTabs[0];
  const activeRegistration =
    registrationTabs.find((tab) => tab.id === activeRegistrationTab) ?? registrationTabs[0];

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
      description="가입한 모임과 신청 내역을 한곳에서 확인하세요."
    >
      <div className="my-dashboard">
        <aside className="profile-column">
          <Card as="section" className="profile-card">
            <p className="account-eyebrow">나의 프로필</p>
            <ProfileAvatar member={member} />
            <h2>{member.crewName}</h2>
            <p>{memberMetaLabel(member)}</p>
          </Card>
          <div aria-hidden="true" className="profile-companion" />
        </aside>
        <div className="activity-column">
          <Card as="section" className="dashboard-panel">
            <h2>내 모임</h2>
            <div aria-label="내 모임 유형" className="dashboard-counts" role="tablist">
              {groupTabs.map((tab) => (
                <button
                  aria-controls="my-groups-panel"
                  aria-selected={activeGroupTypeTab === tab.id}
                  data-ph-capture-attribute-action="my_group_type_tab_change"
                  id={`my-group-type-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveGroupTypeTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  <strong>{tab.count}</strong>
                  <span className="dashboard-counts__label">{tab.label}</span>
                </button>
              ))}
            </div>
            <MyActivityBoard
              currentMemberId={member.id}
              emptyState={activeGroup.emptyState}
              items={activeGroup.items}
              kind="groups"
              panelId="my-groups-panel"
              query={activeGroup.query}
              tabId={`my-group-type-tab-${activeGroup.id}`}
            />
          </Card>
          <Card as="section" className="dashboard-panel">
            <h2>내 신청</h2>
            <div aria-label="내 신청 상태" className="dashboard-counts" role="tablist">
              {registrationTabs.map((tab) => (
                <button
                  aria-controls="my-registrations-panel"
                  aria-selected={activeRegistrationTab === tab.id}
                  data-ph-capture-attribute-action="my_registration_status_tab_change"
                  id={`my-registration-status-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => setActiveRegistrationTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  <strong>{tab.count}</strong>
                  <span className="dashboard-counts__label">{tab.label}</span>
                </button>
              ))}
            </div>
            <MyActivityBoard
              emptyState={activeRegistration.emptyState}
              items={activeRegistration.items}
              kind="registrations"
              panelId="my-registrations-panel"
              query={activeRegistration.query}
              tabId={`my-registration-status-tab-${activeRegistration.id}`}
            />
          </Card>
        </div>
      </div>
    </AccountLayout>
  );
}
