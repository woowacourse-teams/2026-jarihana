export const routeRegistry = Object.freeze([
  { access: "public", page: "GroupsPage", path: "/" },
  { access: "public", page: "GroupBrowsePage", path: "/groups" },
  { access: "public", page: "GroupBrowsePage", path: "/groups/explore", redirectTo: "/groups" },
  { access: "public", page: "ActivityPostsPage", path: "/activities" },
  { access: "public", page: "GroupDetailPage", path: "/groups/:groupId" },
  {
    access: "public",
    page: "RecruitmentDetailPage",
    path: "/groups/:groupId/recruitments/:recruitmentId"
  },
  { access: "public", page: "OAuthCallbackPage", path: "/oauth/callback" },
  { access: "signup", page: "SignupPage", path: "/signup" },
  { access: "member", page: "NotificationsPage", path: "/notifications" },
  { access: "member", page: "NotificationOpenPage", path: "/notifications/open/:id" },
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
    page: "GroupRecruitmentHistoryManagePage",
    path: "/groups/:groupId/manage/recruitments/history"
  },
  {
    access: "leader",
    page: "RegistrationManagePage",
    path: "/groups/:groupId/manage/registrations"
  },
  {
    access: "leader",
    page: "RegistrationManagePage",
    path: "/groups/:groupId/manage/recruitments/:recruitmentId/registrations"
  },
  { access: "public", page: "ShowcasePage", path: "/__showcase" },
  { access: "public", page: "NotFoundPage", path: "*" }
]);
