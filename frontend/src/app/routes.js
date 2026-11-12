import {
  RHYTHM_CHALLENGE_PATH,
  RHYTHM_ENTRY_PATH,
  RHYTHM_PRACTICE_ENABLED,
  RHYTHM_PRACTICE_PATH,
  RHYTHM_SINGLE_PATH
} from "../features/game/rhythm/availability.js";

export const routeRegistry = Object.freeze([
  { access: "public", page: "ShopPage", path: "/shop" },
  { access: "public", page: "GamesPage", path: "/games" },
  { access: "public", page: "GomokuLobbyPage", path: "/games/gomoku" },
  { access: "member", page: "GomokuRoomPage", path: "/games/gomoku/rooms/:roomId" },
  { access: "member", page: "GomokuObservationPage", path: "/games/gomoku/rooms/:roomId/watch" },
  { access: "public", page: "GomokuInvitationPage", path: "/games/gomoku/invite/:token" },
  { access: "public", page: "StickHalvingRoomPage", path: "/games/stick-halving" },
  { access: "public", page: "RhythmHarpoonEntryPage", path: "/games/rhythm-harpoon" },
  // 혼자 연습을 닫아 둔 동안에는 싱글 플레이가 곧 랭킹 도전이라 옵션 화면으로 바로 보내고,
  // 연습 주소는 누구나 볼 수 있는 처음 화면으로 보낸다.
  {
    access: "public",
    page: "RhythmHarpoonSinglePage",
    path: RHYTHM_SINGLE_PATH,
    ...(RHYTHM_PRACTICE_ENABLED ? {} : { redirectTo: RHYTHM_CHALLENGE_PATH })
  },
  { access: "public", page: "RhythmHarpoonLessonPage", path: "/games/rhythm-harpoon/learn" },
  {
    access: "public",
    page: "RhythmHarpoonPage",
    path: RHYTHM_PRACTICE_PATH,
    ...(RHYTHM_PRACTICE_ENABLED ? {} : { redirectTo: RHYTHM_ENTRY_PATH })
  },
  {
    access: "member",
    page: "RhythmHarpoonChallengePage",
    path: RHYTHM_CHALLENGE_PATH
  },
  { access: "member", page: "ChatPage", path: "/chat" },
  { access: "member", page: "ChatPage", path: "/chat/:roomId" },
  { access: "public", page: "HomePage", path: "/" },
  { access: "public", page: "GroupsPage", path: "/home" },
  { access: "public", page: "LandingPage", path: "/land" },
  { access: "public", page: "DemodayLandingPage", path: "/land/demoday" },
  { access: "public", page: "LandingJoinPage", path: "/land/join" },
  { access: "public", page: "LandingCreatePage", path: "/land/create" },
  { access: "public", page: "LandingSparringPage", path: "/land/sparring" },
  { access: "public", page: "LandingGamesPage", path: "/land/games" },
  { access: "public", page: "GroupBrowsePage", path: "/groups" },
  { access: "public", page: "GroupBrowsePage", path: "/groups/explore", redirectTo: "/groups" },
  { access: "public", page: "ActivityPostsPage", path: "/activities" },
  { access: "public", page: "ProposalBoardPage", path: "/board" },
  { access: "member", page: "ProposalCreatePage", path: "/board/new" },
  { access: "public", page: "ProposalDetailPage", path: "/board/:proposalId" },
  { access: "public", page: "SparringPage", path: "/sparring" },
  { access: "public", page: "SparringDetailPage", path: "/sparring/:topicId" },
  { access: "public", page: "PeperoDayEventPage", path: "/events/pepero-day" },
  { access: "public", page: "GroupDetailPage", path: "/groups/:groupId" },
  { access: "public", page: "GroupDetailPage", path: "/groups/:groupId/space" },
  { access: "public", page: "SpaceStudioPage", path: "/space/studio" },
  {
    access: "public",
    page: "AnnouncementDetailPage",
    path: "/groups/:groupId/announcements/:announcementId"
  },
  {
    access: "public",
    page: "RecruitmentDetailPage",
    path: "/groups/:groupId/recruitments/:recruitmentId"
  },
  { access: "public", page: "OAuthCallbackPage", path: "/oauth/callback" },
  { access: "signup", page: "SignupPage", path: "/signup" },
  { access: "public", page: "InvitationPage", path: "/invitations/:invitationId" },
  { access: "public", page: "InvitationPage", path: "/invitations/link/:token" },
  { access: "member", page: "NotificationOpenPage", path: "/notifications/open/:id" },
  { access: "member", page: "MyPage", path: "/my" },
  { access: "member", page: "AvatarPage", path: "/my/avatar" },
  { access: "member", page: "MyPointsPage", path: "/my/points" },
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
