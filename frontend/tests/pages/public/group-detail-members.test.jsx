import { render, screen, within } from "@testing-library/react";

import { GroupDetailPage } from "../../../src/pages/groups/GroupDetailPage.jsx";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";

let mockGroup;
let mockMemberQuery;
const mockIdleInfinite = {
  data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
  isLoading: false,
  isError: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn()
};

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: "/groups/41", search: "?tab=members", state: null }),
  useNavigate: () => jest.fn(),
  useParams: () => ({ groupId: "41" }),
  useSearchParams: () => [new URLSearchParams("tab=members"), jest.fn()]
}));
jest.mock("../../../src/features/auth/index.js", () => ({
  useAuth: () => ({ isAuthenticated: false, member: null })
}));
jest.mock("../../../src/features/group/index.js", () => ({
  useGroup: () => ({ data: mockGroup, isLoading: false, isError: false })
}));
jest.mock("../../../src/features/member/index.js", () => ({
  useInfiniteGroupMembers: () => mockMemberQuery
}));
jest.mock("../../../src/features/recruitment/index.js", () => ({
  useInfiniteRecruitments: () => mockIdleInfinite,
  useRecruitment: () => ({ data: null, isLoading: false, isError: false })
}));
jest.mock("../../../src/features/registration/index.js", () => ({
  useCreateRegistration: () => ({ isPending: false }),
  useWithdrawRegistration: () => ({ isPending: false })
}));

const leader = { memberId: 7, crewName: "써니", memberType: "CREW", generation: 11 };
const leaderMember = { ...leader, groupMemberId: 1, role: "LEADER" };
const members = [
  { groupMemberId: 3, memberId: 19, crewName: "우아", memberType: "CREW", generation: 12, role: "MEMBER" },
  { groupMemberId: 2, memberId: 20, crewName: "한나", memberType: "CREW", generation: 11, role: "MEMBER" }
];

function memberNames() {
  return [...document.querySelectorAll(".group-member-card__name-row strong")]
    .map((element) => element.textContent);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGroup = {
    id: 41,
    type: "STUDY",
    status: "ACTIVE",
    name: "함께 배우는 모임",
    introduction: "같이 읽고 배워요",
    description: "매주 한 번 만나요.",
    meetingType: "FLEXIBLE",
    location: null,
    leader,
    memberCount: 3,
    currentMemberRole: null,
    recurringSchedule: null,
    sessionSchedule: null,
    activeRecruitment: null,
    createdAt: "2026-10-01T10:00:00"
  };
  mockMemberQuery = { ...mockIdleInfinite };
});

it("shows the leader first while preserving the other members' order", () => {
  const items = [...members, leaderMember];
  mockMemberQuery.data = { pages: [{ items }] };

  render(<GroupDetailPage />, { wrapper: ToastProvider });

  expect(memberNames()).toEqual(["써니", "우아", "한나"]);
  expect(items).toEqual([...members, leaderMember]);
  expect(document.querySelector("[data-member-card]")).toHaveTextContent("운영자");
});

it("shows the leader before loading the page that contains their membership", () => {
  mockMemberQuery = {
    ...mockIdleInfinite,
    data: { pages: [{ items: members, hasNext: true, nextCursor: "next" }] },
    hasNextPage: true
  };

  const view = render(<GroupDetailPage />, { wrapper: ToastProvider });

  expect(memberNames()).toEqual(["써니", "우아", "한나"]);
  expect(mockMemberQuery.fetchNextPage).not.toHaveBeenCalled();

  mockMemberQuery = {
    ...mockMemberQuery,
    data: { pages: [...mockMemberQuery.data.pages, { items: [leaderMember], hasNext: false, nextCursor: null }] },
    hasNextPage: false
  };
  view.rerender(<GroupDetailPage />);

  expect(memberNames()).toEqual(["써니", "우아", "한나"]);
  expect(screen.getByText("전체 참여자").parentElement).toHaveTextContent("3");
});

it("uses the current leader after leadership is transferred", () => {
  mockGroup.leader = members[1];
  mockMemberQuery.data = { pages: [{ items: [members[0], { ...leaderMember, role: "MEMBER" }, { ...members[1], role: "LEADER" }] }] };

  render(<GroupDetailPage />, { wrapper: ToastProvider });

  expect(memberNames()).toEqual(["한나", "우아", "써니"]);
  expect(document.querySelector("[data-member-card]")).toHaveTextContent("운영자");
});

it("keeps a coach leader's profile information", () => {
  mockGroup.leader = { ...leader, memberType: "COACH", generation: null };
  mockMemberQuery.data = { pages: [{ items: members }] };

  render(<GroupDetailPage />, { wrapper: ToastProvider });

  expect(within(document.querySelector("[data-member-card]")).getByText("코치")).toBeVisible();
  expect(memberNames()[0]).toBe("써니");
});

it("labels bootcamp and professional members by type and groups them in the cohort chart", () => {
  mockMemberQuery.data = {
    pages: [{
      items: [
        leaderMember,
        { groupMemberId: 4, memberId: 21, crewName: "도담", memberType: "BOOTCAMP", generation: null, role: "MEMBER" },
        { groupMemberId: 5, memberId: 22, crewName: "하나", memberType: "PROFESSIONAL", generation: null, role: "MEMBER" }
      ]
    }]
  };

  render(<GroupDetailPage />, { wrapper: ToastProvider });

  const cards = [...document.querySelectorAll("[data-member-card]")];
  const cardOf = (name) => cards.find((card) => card.textContent.includes(name));
  expect(within(cardOf("도담")).getByText("부트캠프")).toBeVisible();
  expect(within(cardOf("하나")).getByText("현직자")).toBeVisible();
  expect(screen.getByLabelText(/^부트캠프\s\S\s1명$/)).toBeInTheDocument();
  expect(screen.getByLabelText(/^현직자\s\S\s1명$/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/기수 미정/)).not.toBeInTheDocument();
});

it("keeps the empty state when the group has no leader or members", () => {
  mockGroup.leader = null;

  render(<GroupDetailPage />, { wrapper: ToastProvider });

  expect(screen.getByText("아직 함께하는 참여자가 없어요")).toBeVisible();
});

it("keeps member-query failures visible instead of showing an incomplete list", () => {
  mockMemberQuery.isError = true;

  render(<GroupDetailPage />, { wrapper: ToastProvider });

  expect(screen.getByText("참여자를 불러오지 못했어요")).toBeVisible();
  expect(memberNames()).toEqual([]);
});
