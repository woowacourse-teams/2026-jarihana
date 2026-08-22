export const routeRegistry = Object.freeze([
  { access: "public", page: "GroupsPage", path: "/" },
  { access: "public", page: "GroupsPage", path: "/groups" },
  { access: "public", page: "GroupDetailPage", path: "/groups/:groupId" },
  {
    access: "public",
    page: "RecruitmentDetailPage",
    path: "/groups/:groupId/recruitments/:recruitmentId"
  },
  { access: "public", page: "OAuthCallbackPage", path: "/oauth/callback" },
  { access: "signup", page: "SignupPage", path: "/signup" },
  { access: "member", page: "MyPage", path: "/my" },
  { access: "member", page: "MyGroupsPage", path: "/my/groups" },
  { access: "member", page: "MyRegistrationsPage", path: "/my/registrations" },
  { access: "member", page: "GroupCreatePage", path: "/groups/new" },
  { access: "leader", page: "GroupManagePage", path: "/groups/:groupId/manage" },
  {
    access: "leader",
    page: "GroupMembersManagePage",
    path: "/groups/:groupId/manage/members"
  },
  {
    access: "leader",
    page: "GroupRecruitmentsManagePage",
    path: "/groups/:groupId/manage/recruitments"
  },
  {
    access: "leader",
    page: "RegistrationManagePage",
    path: "/groups/:groupId/manage/recruitments/:recruitmentId/registrations"
  },
  { access: "public", page: "ShowcasePage", path: "/__showcase" },
  { access: "public", page: "NotFoundPage", path: "*" }
]);
