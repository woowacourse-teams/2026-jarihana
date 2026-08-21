import { NotFoundState, PageContainer } from "../shared/ui";

export { ShowcasePage } from "./ShowcasePage.jsx";
export {
  MyGroupsPage,
  MyPage,
  MyRegistrationsPage,
  OAuthCallbackPage,
  SignupPage
} from "./account";
export { GroupManagePage, NewGroupPage as GroupCreatePage } from "./group-editor";
export { GroupDetailPage, GroupsPage, RecruitmentDetailPage } from "./groups";
export {
  ManageMembersPage as GroupMembersManagePage,
  ManageRecruitmentsPage as GroupRecruitmentsManagePage,
  ManageRegistrationsPage as RegistrationManagePage
} from "./manage";

export function NotFoundPage() {
  return (
    <PageContainer>
      <NotFoundState action={<a href="/groups">모임 둘러보기</a>} />
    </PageContainer>
  );
}
