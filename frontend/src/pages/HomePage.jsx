import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router";

import { useAuth } from "../features/auth";

const LandingPage = lazy(() =>
  import("./landing/LandingPage").then((module) => ({ default: module.LandingPage }))
);

function HomeLoading() {
  return <div className="route-loading" role="status">홈 불러오는 중</div>;
}

export function HomePage() {
  const { status } = useAuth();
  const { search, hash } = useLocation();
  if (status === "loading") return <HomeLoading />;
  if (status === "authenticated") return <Navigate replace to={{ pathname: "/home", search, hash }} />;

  return (
    <Suspense fallback={<HomeLoading />}>
      <LandingPage />
    </Suspense>
  );
}
