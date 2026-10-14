import { lazy, Suspense } from "react";

import { useAuth } from "../features/auth";

const GroupsPage = lazy(() =>
  import("./groups/GroupsPage").then((module) => ({ default: module.GroupsPage }))
);
const LandingPage = lazy(() =>
  import("./landing/LandingPage").then((module) => ({ default: module.LandingPage }))
);

function HomeLoading() {
  return <div className="route-loading" role="status">홈 불러오는 중</div>;
}

export function HomePage() {
  const { status } = useAuth();
  if (status === "loading") return <HomeLoading />;

  return (
    <Suspense fallback={<HomeLoading />}>
      {status === "authenticated" ? <GroupsPage /> : <LandingPage />}
    </Suspense>
  );
}
