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
  return render(page);
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

it("Given group results, when the explorer loads, then cards and result state are visible", () => {
  groupHooks.useInfiniteGroups.mockReturnValue({
    ...idleInfinite,
    data: {
      pages: [
        {
          items: [group],
          nextCursor: "opaque-next",
          hasNext: true
        }
      ]
    },
    hasNextPage: true
  });

  renderAt("/groups", <GroupsPage />);

  const title = screen.getByRole("heading", {
    level: 1,
    name: "크루와 함께할 자리를 찾아보세요"
  });
  expect(within(title).getAllByText(/크루와|함께할 자리를|찾아보세요/)).toHaveLength(3);
  expect(screen.getByRole("link", { name: /우아한 JDBC 탐구생활/ })).toHaveAttribute(
    "href",
    "/groups/41"
  );
  expect(screen.getByText("1개의 모임")).toBeInTheDocument();
  expect(screen.getByText("최신순")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "더 많은 모임 보기" })).toBeEnabled();
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

it("Given a group, when the member tab is selected, then members load in a semantic tab panel", async () => {
  const user = userEvent.setup();
  memberHooks.useInfiniteGroupMembers.mockReturnValue({
    ...idleInfinite,
    data: {
      pages: [
        {
          items: [
            {
              groupMemberId: 1,
              memberId: 7,
              crewName: "써니",
              generation: 11,
              course: "BACKEND",
              role: "LEADER",
              joinedAt: "2026-07-01T11:00:00"
            }
          ],
          nextCursor: null,
          hasNext: false
        }
      ]
    }
  });

  const { rerender } = renderAt("/groups/41", <GroupDetailPage />);
  await user.click(screen.getByRole("tab", { name: "멤버" }));
  rerender(<GroupDetailPage />);

  const panel = screen.getByRole("tabpanel", { name: "멤버" });
  expect(within(panel).getByText("써니")).toBeInTheDocument();
  expect(within(panel).getByText(/11기/)).toBeInTheDocument();
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

it("Given overlapping cursor pages, when results render, then each group appears once", () => {
  groupHooks.useInfiniteGroups.mockReturnValue({
    ...idleInfinite,
    data: {
      pages: [
        { items: [group], nextCursor: "page-two", hasNext: true },
        { items: [group], nextCursor: null, hasNext: false }
      ]
    }
  });

  renderAt("/groups", <GroupsPage />);

  expect(screen.getAllByRole("link", { name: /우아한 JDBC 탐구생활/ })).toHaveLength(1);
  expect(screen.getByText("1개의 모임")).toBeInTheDocument();
});

it("Given the introduction tab, when detail renders, then downstream lists stay unmounted", () => {
  renderAt("/groups/41", <GroupDetailPage />);

  expect(memberHooks.useInfiniteGroupMembers).not.toHaveBeenCalled();
  expect(recruitmentHooks.useInfiniteRecruitments).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "활동 방식" })).not.toBeInTheDocument();
});

it("Given an archived group, when detail renders, then the recruitment sidebar is hidden", () => {
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, status: "ENDED", activeRecruitment: null },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByRole("complementary", { name: "모집과 운영자 정보" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "아카이빙된 모임입니다" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "새 모집 만들기" })).not.toBeInTheDocument();
  expect(screen.queryByText("모집 중")).not.toBeInTheDocument();
  expect(screen.queryByText("모집 인원")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /가입 신청|모집 마감|운영자/ })).not.toBeInTheDocument();
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

it("Given the explorer, when desktop controls render, then search and filters share one compact tool row", () => {
  const { container } = renderAt("/groups", <GroupsPage />);

  const tools = container.querySelector(".groups-tools");
  expect(tools).toContainElement(screen.getByRole("search"));
  expect(tools).toContainElement(screen.getByRole("group", { name: "모임 유형" }));
  const submit = screen.getByRole("button", { name: "검색" });
  expect(submit).toHaveClass("groups-search__submit");
  expect(submit.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

it("Given the backend default image, when a result renders, then the card displays that server asset", () => {
  groupHooks.useInfiniteGroups.mockReturnValue({
    ...idleInfinite,
    data: { pages: [{ items: [group], nextCursor: null, hasNext: false }] }
  });

  const { container } = renderAt("/groups", <GroupsPage />);

  const frame = container.querySelector(".groups-card-frame");
  const card = screen.getByRole("link", { name: /우아한 JDBC 탐구생활/ });
  expect(frame).toContainElement(card);
  expect(card.querySelector("img.ui-group-card__image")).toHaveAttribute(
    "src",
    "/images/default-group.png"
  );
  expect(frame).not.toHaveClass("groups-card-frame--fallback");
});

it("Given a group, when detail renders, then API-backed information and leader share the Figma hierarchy", () => {
  const { container } = renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByRole("heading", { name: "모임 정보" })).toBeInTheDocument();
  const profile = container.querySelector(".group-profile");
  expect(
    within(profile)
      .getAllByRole("term")
      .map((term) => term.textContent)
  ).toEqual(["모임 일정", "현재 멤버 수"]);
  const rail = container.querySelector(".group-rail-card");
  expect(rail).toContainElement(screen.getByText("모집 시작"));
  expect(within(rail).getByText("써니")).toBeInTheDocument();
  expect(container.querySelectorAll(".group-profile__figure > span")).toHaveLength(4);
});
