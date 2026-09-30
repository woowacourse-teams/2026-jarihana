import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";

import { Skeleton } from "../shared/ui";
import { AnalyticsBridge } from "./AnalyticsBridge";
import { AppShell } from "./AppShell";
import { AuthGuard } from "./AuthGuard";
import { LeaderGuard } from "./LeaderGuard";
import { routeRegistry } from "./routes";
import { SignupGuard } from "./SignupGuard";

function lazyNamed(loadModule, exportName) {
  return lazy(async () => {
    const module = await loadModule();
    return { default: module[exportName] };
  });
}

const loadAccountPages = () => import("../pages/account/index.js");
const loadGroupEditorPages = () => import("../pages/group-editor/index.jsx");
const loadGroupPages = () => import("../pages/groups/index.js");
const loadManagePages = () => import("../pages/manage/index.js");

export const lazyPageRegistry = Object.freeze({
  GroupBrowsePage: lazyNamed(loadGroupPages, "GroupBrowsePage"),
  GroupCreatePage: lazyNamed(loadGroupEditorPages, "NewGroupPage"),
  GroupDetailPage: lazyNamed(loadGroupPages, "GroupDetailPage"),
  GroupManagePage: lazyNamed(loadGroupEditorPages, "GroupManagePage"),
  GroupMembersManagePage: lazyNamed(loadManagePages, "ManageMembersPage"),
  GroupRecruitmentHistoryManagePage: lazyNamed(
    loadManagePages,
    "ManageRecruitmentHistoryPage"
  ),
  GroupRecruitmentsManagePage: lazyNamed(loadManagePages, "ManageRecruitmentsPage"),
  GroupsPage: lazyNamed(loadGroupPages, "GroupsPage"),
  MyGroupsPage: lazyNamed(loadAccountPages, "MyGroupsPage"),
  MyPage: lazyNamed(loadAccountPages, "MyPage"),
  MyRegistrationsPage: lazyNamed(loadAccountPages, "MyRegistrationsPage"),
  NotFoundPage: lazyNamed(() => import("../pages/index.js"), "NotFoundPage"),
  OAuthCallbackPage: lazyNamed(loadAccountPages, "OAuthCallbackPage"),
  RecruitmentDetailPage: lazyNamed(loadGroupPages, "RecruitmentDetailPage"),
  RegistrationManagePage: lazyNamed(loadManagePages, "ManageRegistrationsPage"),
  ShowcasePage: lazyNamed(() => import("../pages/ShowcasePage.jsx"), "ShowcasePage"),
  SignupPage: lazyNamed(loadAccountPages, "SignupPage")
});

function PageLoading() {
  return (
    <div className="route-loading">
      <Skeleton aria-label="페이지 불러오는 중" />
    </div>
  );
}

function guardedPage(access, Page) {
  const page = (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  );

  if (access === "member") {
    return <AuthGuard>{page}</AuthGuard>;
  }

  if (access === "leader") {
    return <LeaderGuard>{page}</LeaderGuard>;
  }

  if (access === "signup") {
    return <SignupGuard>{page}</SignupGuard>;
  }

  return page;
}

function RouteRedirect({ to }) {
  const { hash, search } = useLocation();
  return <Navigate replace to={{ pathname: to, search, hash }} />;
}

export function createAppRouteElements(pageRegistry) {
  return routeRegistry.map((route) => {
    if (route.redirectTo) {
      return <Route element={<RouteRedirect to={route.redirectTo} />} key={route.path} path={route.path} />;
    }

    const Page = pageRegistry[route.page];
    if (!Page) {
      throw new Error(`등록되지 않은 페이지 export: ${route.page}`);
    }

    return <Route element={guardedPage(route.access, Page)} key={route.path} path={route.path} />;
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>{createAppRouteElements(lazyPageRegistry)}</Route>
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AnalyticsBridge />
      <AppRoutes />
    </BrowserRouter>
  );
}
