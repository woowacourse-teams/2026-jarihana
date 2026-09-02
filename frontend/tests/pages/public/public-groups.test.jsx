import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as authHooks from "../../../src/features/auth/index.js";
import * as groupHooks from "../../../src/features/group/index.js";
import * as memberHooks from "../../../src/features/member/index.js";
import * as recruitmentHooks from "../../../src/features/recruitment/index.js";
import * as registrationHooks from "../../../src/features/registration/index.js";
import {
  GroupDetailPage,
  GroupsPage,
  RecruitmentDetailPage
} from "../../../src/pages/groups/index.js";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";

let mockRouteParams = {};
let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = jest.fn((next) => {
  mockSearchParams = new URLSearchParams(next);
});

jest.mock(
  "react-router",
  () => ({
    Link: ({ children, to, ...props }) => (
      <a href={typeof to === "string" ? to : "/"} {...props}>
        {children}
      </a>
    ),
    useLocation: () => ({ pathname: "/groups/41", search: "", state: null }),
    useNavigate: () => jest.fn(),
    useParams: () => mockRouteParams,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams]
  }),
  { virtual: true }
);

jest.mock("../../../src/features/group/index.js", () => ({
  useGroup: jest.fn(),
  useInfiniteGroups: jest.fn()
}));
jest.mock("../../../src/features/member/index.js", () => ({
  useInfiniteGroupMembers: jest.fn()
}));
jest.mock("../../../src/features/recruitment/index.js", () => ({
  useInfiniteRecruitments: jest.fn(),
  useRecruitment: jest.fn()
}));
jest.mock("../../../src/features/registration/index.js", () => ({
  useCreateRegistration: jest.fn()
}));
jest.mock("../../../src/features/auth/index.js", () => ({ useAuth: jest.fn() }));

const group = {
  id: 41,
  type: "STUDY",
  meetingType: "FLEXIBLE",
  location: null,
  status: "ACTIVE",
  name: "우아한 JDBC 탐구생활",
  introduction: "JDBC 내부 동작을 이해하고, 더 좋은 설계를 고민해요.",
  description: "브라우저 성능과 사용자 경험을 함께 관찰하고 기록합니다.",
  representativeImageUrl: "/images/default-group.png",
  leader: { memberId: 7, crewName: "써니", generation: 11 },
  memberCount: 6,
  currentMemberRole: null,
  recurringSchedule: {
    daysOfWeek: ["MONDAY"],
    startTime: "19:00:00",
    endTime: "21:00:00"
  },
  sessionSchedule: null,
  activeRecruitment: {
    id: 91,
    joinMethod: "APPROVAL",
    capacity: 10,
    approvedCount: 6,
    startsAt: "2026-08-10T09:00:00",
    endsAt: "2026-08-21T23:59:59"
  },
  createdAt: "2026-07-01T10:30:00"
};

const recruitment = {
  id: 91,
  group: { id: 41, name: group.name, status: "ACTIVE" },
  joinMethod: "APPROVAL",
  capacity: 10,
  approvedCount: 6,
  remainingSeats: 4,
  startsAt: "2026-08-10T09:00:00",
  endsAt: "2026-08-21T23:59:59",
  recruitingStatus: "OPEN",
  createdAt: "2026-08-01T09:00:00"
};

const idleInfinite = {
  data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
  isLoading: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn()
};

function renderAt(path, page) {
  const url = new URL(path, "https://jarihana.test");
  mockSearchParams = url.searchParams;
  const segments = url.pathname.split("/").filter(Boolean);
  mockRouteParams = {
    groupId: segments[1],
    recruitmentId: segments[3]
  };
  return render(page, { wrapper: ToastProvider });
}

beforeEach(() => {
  jest.clearAllMocks();
  groupHooks.useInfiniteGroups.mockReturnValue(idleInfinite);
  groupHooks.useGroup.mockReturnValue({ data: group, isLoading: false, isError: false });
  memberHooks.useInfiniteGroupMembers.mockReturnValue(idleInfinite);
  recruitmentHooks.useInfiniteRecruitments.mockReturnValue(idleInfinite);
  recruitmentHooks.useRecruitment.mockReturnValue({
    data: recruitment,
    isLoading: false,
    isError: false
  });
  registrationHooks.useCreateRegistration.mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue({ id: 301, status: "PENDING" }),
    isPending: false,
    isSuccess: false,
    error: null
  });
  authHooks.useAuth.mockReturnValue({
    isAuthenticated: true,
    user: { id: 19, crewName: "우아", generation: 12, course: "BACKEND" }
  });
});

it("Given the legacy groups URL, when the explorer loads, then the current landing affordance is visible", () => {
  renderAt("/groups", <GroupsPage />);

  expect(screen.getByRole("button", { name: "자리 둘러보기로 이동" })).toBeInTheDocument();
});

it("Given filters, when search is submitted, then the URL-backed query reaches the hook", async () => {
  const user = userEvent.setup();
  const { rerender } = renderAt("/groups?type=CLUB", <GroupsPage />);

  await user.clear(screen.getByRole("searchbox", { name: "모임 검색" }));
  await user.type(screen.getByRole("searchbox", { name: "모임 검색" }), "  자바  ");
  await user.click(screen.getByRole("button", { name: "검색" }));

  rerender(<GroupsPage />);
  expect(groupHooks.useInfiniteGroups).toHaveBeenLastCalledWith(
    expect.objectContaining({ keyword: "자바", type: "CLUB" })
  );
});

it("Given an authenticated member, when an application is confirmed, then the original LocalDateTime-safe payload is submitted", async () => {
  const user = userEvent.setup();
  const mutateAsync = jest.fn().mockResolvedValue({ id: 301, status: "PENDING" });
  registrationHooks.useCreateRegistration.mockReturnValue({
    mutateAsync,
    isPending: false,
    isSuccess: false,
    error: null
  });

  renderAt("/groups/41/recruitments/91", <RecruitmentDetailPage />);
  await user.type(
    screen.getByRole("textbox", { name: "가입 신청 메시지" }),
    "매주 성실히 참여하겠습니다."
  );
  await user.click(screen.getByRole("button", { name: "가입 신청하기" }));
  await user.click(screen.getByRole("button", { name: "신청 확정" }));

  expect(mutateAsync).toHaveBeenCalledWith({ message: "매주 성실히 참여하겠습니다." });
  expect(
    screen.getByText(
      (_, element) => element.tagName === "DD" && element.textContent.startsWith("2026.08.10 09:00")
    )
  ).toBeInTheDocument();
});

it("Given an approved group member, when the detail page renders, then application is disabled", async () => {
  const user = userEvent.setup();
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, currentMemberRole: "MEMBER" },
    isLoading: false,
    isError: false
  });
  const mutateAsync = jest.fn();
  registrationHooks.useCreateRegistration.mockReturnValue({
    mutateAsync,
    isPending: false,
    isSuccess: false,
    error: null,
    reset: jest.fn()
  });

  renderAt("/groups/41", <GroupDetailPage />);

  const button = screen.getByRole("button", { name: "가입 완료!" });
  expect(button).toBeDisabled();
  await user.click(button);
  expect(mutateAsync).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("Given a pending application, when the detail page renders, then application is disabled", async () => {
  const user = userEvent.setup();
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, currentMemberRegistrationStatus: "PENDING" },
    isLoading: false,
    isError: false
  });
  const mutateAsync = jest.fn();
  registrationHooks.useCreateRegistration.mockReturnValue({
    mutateAsync,
    isPending: false,
    isSuccess: false,
    error: null,
    reset: jest.fn()
  });

  renderAt("/groups/41", <GroupDetailPage />);

  const button = screen.getByRole("button", { name: "신청 완료" });
  expect(button).toBeDisabled();
  await user.click(button);
  expect(mutateAsync).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("Given an active recruitment, when group detail renders, then the invitation illustration frames the summary", () => {
  const { container } = renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByRole("heading", { name: "자리하나?" })).toBeInTheDocument();
  expect(container.querySelector(".group-recruitment-hero--open img")).toBeInTheDocument();
});

it("Given a group detail, when the mobile recruitment action opens, then recruitment information appears in a dialog", async () => {
  const user = userEvent.setup();
  renderAt("/groups/41", <GroupDetailPage />);

  const trigger = screen.getByRole("button", { name: "모집 정보 보기" });
  expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

  await user.click(trigger);

  const dialog = screen.getByRole("dialog", { name: "모집 정보" });
  expect(within(dialog).getByRole("heading", { name: "자리하나?" })).toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});

it("Given no active recruitment, when group detail renders, then the fallen-chair empty state is concise", () => {
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, activeRecruitment: null },
    isLoading: false,
    isError: false
  });

  const { container } = renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByRole("heading", { name: "자리없음" })).toBeInTheDocument();
  expect(screen.queryByText("현재 진행 중인 모집이 없어요")).not.toBeInTheDocument();
  expect(container.querySelector(".group-recruitment-hero--empty img")).toBeInTheDocument();
});

it("Given a closed recruitment, when opened, then no application control is exposed", () => {
  recruitmentHooks.useRecruitment.mockReturnValue({
    data: { ...recruitment, recruitingStatus: "CLOSED" },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41/recruitments/91", <RecruitmentDetailPage />);

  expect(screen.getByText("모집이 마감되었어요")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "가입 신청하기" })).not.toBeInTheDocument();
});

it("Given the introduction tab, when detail renders, then downstream lists stay unmounted", () => {
  renderAt("/groups/41", <GroupDetailPage />);

  expect(memberHooks.useInfiniteGroupMembers).not.toHaveBeenCalled();
  expect(recruitmentHooks.useInfiniteRecruitments).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "활동 방식" })).not.toBeInTheDocument();
});

it("Given a group failure, when detail renders, then no downstream request executes", () => {
  groupHooks.useGroup.mockReturnValue({
    data: undefined,
    error: { status: 403, message: "java.lang.InternalSecret" },
    isError: true,
    isLoading: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  expect(memberHooks.useInfiniteGroupMembers).not.toHaveBeenCalled();
  expect(recruitmentHooks.useInfiniteRecruitments).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "이 모임을 볼 권한이 없어요" })).toBeInTheDocument();
  expect(screen.queryByText(/InternalSecret/)).not.toBeInTheDocument();
});

it.each([
  [404, "모임을 찾을 수 없어요"],
  [500, "모임을 불러오지 못했어요"]
])(
  "Given status %s, when group detail fails, then a safe differentiated state is shown",
  (status, title) => {
    groupHooks.useGroup.mockReturnValue({
      data: undefined,
      error: { status, message: "org.hibernate.ConnectionFailure" },
      isError: true,
      isLoading: false,
      refetch: jest.fn()
    });

    renderAt("/groups/41", <GroupDetailPage />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByText(/hibernate/)).not.toBeInTheDocument();
  }
);

it("Given a server application failure, when shown, then internal text is replaced by safe guidance", () => {
  registrationHooks.useCreateRegistration.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
    isSuccess: false,
    error: { status: 500, message: "SQLException: registration_table" }
  });

  renderAt("/groups/41/recruitments/91", <RecruitmentDetailPage />);

  expect(screen.getByRole("alert")).toHaveTextContent("신청을 보내지 못했어요");
  expect(screen.queryByText(/SQLException/)).not.toBeInTheDocument();
});

it("Given a group detail, when the page renders, then list navigation is integrated into the hero", () => {
  const scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { container } = renderAt("/groups/41", <GroupDetailPage />);

  const profile = container.querySelector(".group-profile");
  const backLink = screen.getByRole("link", { name: "목록으로" });
  expect(profile).toContainElement(backLink);
  expect(backLink).toHaveAttribute("href", "/groups");
  scrollTo.mockRestore();
});

it("Given a group leader, when detail renders, then leader context is separate from recruitment", () => {
  const scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { container } = renderAt("/groups/41", <GroupDetailPage />);

  const desktopRail = container.querySelector(".group-rail--desktop");
  const leaderCard = desktopRail.querySelector(".group-leader--card");
  const recruitmentCard = desktopRail.querySelector(".group-recruitment-summary");
  const heroLeader = container.querySelector(".group-profile .group-leader--hero");

  expect(leaderCard).toHaveTextContent("써니");
  expect(leaderCard.nextElementSibling).toBe(recruitmentCard);
  expect(leaderCard.querySelector(".ui-avatar")).toHaveClass("ui-avatar--md");
  expect(recruitmentCard.querySelector(".group-leader")).not.toBeInTheDocument();
  expect(heroLeader).toHaveTextContent("써니");
  expect(heroLeader).toHaveTextContent("운영자 · 11기 크루");
  expect(heroLeader.querySelector(".ui-avatar")).toHaveClass("ui-avatar--sm");
  scrollTo.mockRestore();
});

it("Given a recruitment period, when detail renders, then countdown and details are concise", () => {
  const scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-08-20T12:00:00"));

  try {
    const { container } = renderAt("/groups/41", <GroupDetailPage />);
    const desktopRail = container.querySelector(".group-rail--desktop");
    const period = desktopRail.querySelector(".group-recruitment-period");

    expect(desktopRail.querySelector(".group-recruitment-countdown")).toHaveTextContent(
      "모집 마감까지 2일"
    );
    expect(desktopRail.querySelector(".group-recruitment-details")).toHaveTextContent(
      "일정 자세히"
    );
    expect(within(period).getByText("시작")).toBeInTheDocument();
    expect(within(period).getByText("2026년 8월 10일 09:00")).toBeInTheDocument();
    expect(within(period).getByText("마감")).toBeInTheDocument();
    expect(within(period).getByText("2026년 8월 21일 23:59")).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
    scrollTo.mockRestore();
  }
});

it("Given a retained list scroll, when group detail opens, then the page starts at the top", () => {
  const scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

  renderAt("/groups/41", <GroupDetailPage />);

  expect(scrollTo).toHaveBeenCalledWith(0, 0);
  scrollTo.mockRestore();
});

it("Given meeting details, when the detail page renders, then the information card shows API values", () => {
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, meetingType: "OFFLINE", location: "서울 캠퍼스" },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByText("오프라인")).toBeInTheDocument();
  expect(screen.getByText("서울 캠퍼스")).toBeInTheDocument();
  expect(screen.queryByText("API 미지원")).not.toBeInTheDocument();
});
