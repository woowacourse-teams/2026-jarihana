import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as authHooks from "../../../src/features/auth/index.js";
import * as groupHooks from "../../../src/features/group/index.js";
import * as memberHooks from "../../../src/features/member/index.js";
import * as recruitmentHooks from "../../../src/features/recruitment/index.js";
import * as registrationHooks from "../../../src/features/registration/index.js";
import {
  GroupDetailPage,
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
