import { Navigate, useLocation } from "react-router";

import { useAuth } from "../features/auth";

function HomeLoading() {
  return <div className="route-loading" role="status">홈 불러오는 중</div>;
}

export function HomePage() {
  const { status } = useAuth();
  const { search, hash } = useLocation();
  if (status === "loading") return <HomeLoading />;
  const pathname = status === "authenticated" ? "/home" : "/land";
  return <Navigate replace to={{ pathname, search, hash }} />;
}
