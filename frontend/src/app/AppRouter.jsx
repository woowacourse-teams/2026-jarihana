import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  Routes,
  ScrollRestoration,
  useLocation
} from "react-router";
import { RouterProvider } from "react-router/dom";

import { GroupTransitionProvider } from "../pages/groups/GroupTransition.jsx";
import { Skeleton } from "../shared/ui";
import { AnalyticsBridge } from "./AnalyticsBridge";
import { AppShell } from "./AppShell";
import { AuthGuard } from "./AuthGuard";
import { LeaderGuard } from "./LeaderGuard";
import { createGroupBrowseLoader, createGroupDetailLoader, shouldRevalidateGroupBrowse } from "./routeLoaders";
import { routeRegistry } from "./routes";
import { SignupGuard } from "./SignupGuard";

function lazyNamed(loadModule, exportName) {
  return lazy(async () => {
    const module = await loadModule();
    return { default: module[exportName] };
  });
}

const loadAccountPages = () => import("../pages/account/index.js");
const loadActivityPostPages = () => import("../pages/activity-posts/index.js");
const loadGroupEditorPages = () => import("../pages/group-editor/index.jsx");
const loadGroupPages = () => import("../pages/groups/index.js");
const loadManagePages = () => import("../pages/manage/index.js");

const loadNotificationPages = () => import("../pages/notifications/index.jsx");
export const lazyPageRegistry = Object.freeze({
  NotificationOpenPage: lazyNamed(loadNotificationPages, "NotificationOpenPage"),
  ActivityPostsPage: lazyNamed(loadActivityPostPages, "ActivityPostsPage"),
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

export function createAppRouteElements(pageRegistry, loaders = {}) {
  return routeRegistry.map((route) => {
    if (route.redirectTo) {
      return <Route element={<RouteRedirect to={route.redirectTo} />} key={route.path} path={route.path} />;
    }

    const Page = pageRegistry[route.page];
    if (!Page) {
      throw new Error(`등록되지 않은 페이지 export: ${route.page}`);
    }

    if (["GroupBrowsePage", "GroupDetailPage"].includes(route.page) && loaders[route.page]) {
      return (
        <Route
          key={route.path}
          lazy={async () => {
            const module = await loadGroupPages();
            return { element: guardedPage(route.access, module[route.page]) };
          }}
          loader={loaders[route.page]}
          shouldRevalidate={route.page === "GroupBrowsePage" ? shouldRevalidateGroupBrowse : undefined}
          path={route.path}
        />
      );
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

function RouterLayout() {
  return (
    <>
      <AnalyticsBridge />
      <GroupTransitionProvider>
        <AppShell />
      </GroupTransitionProvider>
      <ScrollRestoration />
    </>
  );
}

const browserRouters = new WeakMap();

export function AppRouter() {
  const queryClient = useQueryClient();
  let router = browserRouters.get(queryClient);

  if (!router) {
    router = createBrowserRouter(
      createRoutesFromElements(
        <Route
          element={<RouterLayout />}
          hydrateFallbackElement={
            <AppShell>
              <PageLoading />
            </AppShell>
          }
        >
          {createAppRouteElements(lazyPageRegistry, {
            GroupBrowsePage: createGroupBrowseLoader(queryClient),
            GroupDetailPage: createGroupDetailLoader(queryClient)
          })}
        </Route>
      )
    );
    browserRouters.set(queryClient, router);
  }

  return <RouterProvider router={router} />;
}
