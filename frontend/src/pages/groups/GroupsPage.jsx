import { useAuth } from "../../features/auth/index.js";
import { useTodaySessions } from "../../features/group/useTodaySessions.js";
import { PageContainer } from "../../shared/ui/index.js";
import { ArchiveSection } from "./home/ArchiveSection.jsx";
import { RecruitingSection } from "./home/RecruitingSection.jsx";
import { TodaySessionsHero } from "./home/TodaySessionsHero.jsx";
import { usePangyoCampus } from "./home/usePangyoCampus.js";
import { useSessionHero } from "./home/useSessionHeadline.js";
import "./groups.css";
import "./home/home.css";

export function GroupsPage() {
  const { status } = useAuth();
  const today = useTodaySessions();
  const campus = usePangyoCampus();
  const { headline, period } = useSessionHero(campus.isAtPangyo);

  return (
    <PageContainer className="groups-page groups-page--home">
      <RecruitingSection
        isAuthenticated={status === "authenticated"}
        headline={headline}
        heroPeriod={period}
        beforeResults={
          <TodaySessionsHero
            campusStatus={campus.status}
            onRequestLocation={campus.requestLocation}
            date={today.date}
            error={today.error}
            groups={today.data}
            isLoading={today.isLoading}
            onRetry={() => today.refetch()}
          />
        }
      />
      <ArchiveSection />
    </PageContainer>
  );
}
