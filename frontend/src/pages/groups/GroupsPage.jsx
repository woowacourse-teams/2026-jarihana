import { useNavigate } from "react-router";

import { storeReturnTarget, useAuth } from "../../features/auth/index.js";
import { useTodaySessions } from "../../features/group/useTodaySessions.js";
import { PageContainer } from "../../shared/ui/index.js";
import { DiscoverySection } from "./home/DiscoverySection.jsx";
import { TodaySessionsHero } from "./home/TodaySessionsHero.jsx";
import "./groups.css";
import "./home/home.css";

export function GroupsPage() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const today = useTodaySessions();

  function handleCreateGroup(type) {
    const target = type === "SESSION" ? "/groups/new?type=SESSION" : "/groups/new";
    if (status === "anonymous") {
      storeReturnTarget(target);
      login();
      return;
    }
    navigate(target);
  }

  return (
    <PageContainer className="groups-page groups-page--home">
      <nav className="home-discovery-nav" aria-label="모임 탐색 바로가기">
        <a href="#sessions-discovery" data-ph-capture-attribute-action="home_sessions_browse">
          같이해요 둘러보기 <span aria-hidden="true">↓</span>
        </a>
        <a href="#community-discovery" data-ph-capture-attribute-action="home_communities_browse">
          스터디·동아리 찾기 <span aria-hidden="true">↓</span>
        </a>
      </nav>
      <TodaySessionsHero
        date={today.date}
        error={today.error}
        groups={today.data}
        isLoading={today.isLoading}
        onRetry={() => today.refetch()}
      />
      <DiscoverySection kind="session" onCreateGroup={handleCreateGroup} />
      <DiscoverySection kind="community" onCreateGroup={handleCreateGroup} />
    </PageContainer>
  );
}
