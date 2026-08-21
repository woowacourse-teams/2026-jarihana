import { Suspense } from "react";

import { AuthGuard } from "../../src/app/AuthGuard";
import { createAppRouteElements, lazyPageRegistry } from "../../src/app/AppRouter";
import { LeaderGuard } from "../../src/app/LeaderGuard";
import { SignupGuard } from "../../src/app/SignupGuard";

jest.mock("react-router", () => ({
  BrowserRouter: ({ children }) => children,
  Navigate: () => null,
  Outlet: () => null,
  Route: () => null,
  Routes: ({ children }) => children,
  useLocation: () => ({ hash: "", pathname: "/", search: "" }),
  useParams: () => ({ groupId: "91" })
}));

jest.mock("../../src/pages", () => {
  const page = (name) =>
    function TestPage() {
      return <h1>{name}</h1>;
    };
  return {
    GroupCreatePage: page("group-create-page"),
    GroupDetailPage: page("group-detail-page"),
    GroupManagePage: page("group-manage-page"),
    GroupMembersManagePage: page("group-members-manage-page"),
    GroupRecruitmentsManagePage: page("group-recruitments-manage-page"),
    GroupsPage: page("groups-page"),
    MyGroupsPage: page("my-groups-page"),
    MyPage: page("my-page"),
    MyRegistrationsPage: page("my-registrations-page"),
    NotFoundPage: page("not-found-page"),
    OAuthCallbackPage: page("oauth-callback-page"),
    RecruitmentDetailPage: page("recruitment-detail-page"),
    RegistrationManagePage: page("registration-manage-page"),
    ShowcasePage: page("showcase-page"),
    SignupPage: page("signup-page")
  };
});

it("wraps member, signup, and leader routes in explicit authority guards", () => {
  // Given
  const pages = {
    GroupCreatePage: () => null,
    GroupDetailPage: () => null,
    GroupManagePage: () => null,
    GroupMembersManagePage: () => null,
    GroupRecruitmentsManagePage: () => null,
    GroupsPage: () => null,
    MyGroupsPage: () => null,
    MyPage: () => null,
    MyRegistrationsPage: () => null,
    NotFoundPage: () => null,
    OAuthCallbackPage: () => null,
    RecruitmentDetailPage: () => null,
    RegistrationManagePage: () => null,
    ShowcasePage: () => null,
    SignupPage: () => null
  };

  // When
  const elements = createAppRouteElements(pages);
  const routes = new Map(elements.map((element) => [element.props.path, element.props.element]));

  // Then
  expect(routes.get("/groups").type).toBe(Suspense);
  expect(routes.get("/groups").props.children.type).toBe(pages.GroupsPage);
  expect(routes.get("/signup").type).toBe(SignupGuard);
  expect(routes.get("/my").type).toBe(AuthGuard);
  expect(routes.get("/my").props.children.type).toBe(Suspense);
  expect(routes.get("/groups/:groupId/manage/members").type).toBe(LeaderGuard);
  expect(routes.get("*").props.children.type).toBe(pages.NotFoundPage);
});

it("defines a lazy component for every page referenced by the route registry", () => {
  const expectedPages = [
    "GroupCreatePage",
    "GroupDetailPage",
    "GroupManagePage",
    "GroupMembersManagePage",
    "GroupRecruitmentsManagePage",
    "GroupsPage",
    "MyGroupsPage",
    "MyPage",
    "MyRegistrationsPage",
    "NotFoundPage",
    "OAuthCallbackPage",
    "RecruitmentDetailPage",
    "RegistrationManagePage",
    "ShowcasePage",
    "SignupPage"
  ];

  expect(Object.keys(lazyPageRegistry).sort()).toEqual(expectedPages.sort());
});
