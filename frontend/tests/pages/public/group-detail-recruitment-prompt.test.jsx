import { act, fireEvent, render, screen } from "@testing-library/react";

import { GroupDetailPage } from "../../../src/pages/groups/index.js";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";
import * as authHooks from "../../../src/features/auth/index.js";
import * as groupHooks from "../../../src/features/group/index.js";
import * as memberHooks from "../../../src/features/member/index.js";
import * as recruitmentHooks from "../../../src/features/recruitment/index.js";
import * as registrationHooks from "../../../src/features/registration/index.js";

/* jsdom에는 ResizeObserver가 없고, 상세 화면의 사이드 레일이 렌더 중에 그것을 만든다. */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const mockNavigate = jest.fn();
let mockLocation = { pathname: "/groups/41", search: "", state: null };

jest.mock(
  "react-router",
  () => ({
    Link: ({ children, to, ...props }) => (
      <a href={typeof to === "string" ? to : "/"} {...props}>
        {children}
      </a>
    ),
    useLocation: () => mockLocation,
    useNavigate: () => mockNavigate,
    useParams: () => ({ groupId: "41" }),
    useSearchParams: () => [new URLSearchParams(), jest.fn()]
  }),
  { virtual: true }
);

jest.mock("../../../src/features/auth/index.js", () => ({ useAuth: jest.fn() }));
jest.mock("../../../src/features/group/index.js", () => ({ useGroup: jest.fn() }));
jest.mock("../../../src/features/member/index.js", () => ({ useInfiniteGroupMembers: jest.fn() }));
jest.mock("../../../src/features/recruitment/index.js", () => ({
  useInfiniteRecruitments: jest.fn(),
  useRecruitment: jest.fn()
}));
jest.mock("../../../src/features/registration/index.js", () => ({
  useCreateRegistration: jest.fn()
}));

const leaderMemberId = 7;

const idleInfinite = {
  data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false
};

const baseGroup = {
  activeRecruitment: null,
  createdAt: "2026-09-01T10:30:00",
  currentMemberRegistrationStatus: null,
  currentMemberRole: "LEADER",
  description: "함께 읽고 씁니다.",
  id: 41,
  introduction: "매주 한 편씩 읽어요",
  leader: { crewName: "써니", generation: 11, memberId: leaderMemberId },
  location: null,
  meetingType: "FLEXIBLE",
  memberCount: 1,
  name: "우아한 JDBC 탐구생활",
  recurringSchedule: null,
  representativeImageUrl: "/images/default-group.png",
  sessionSchedule: null,
  status: "ACTIVE",
  type: "STUDY"
};

function renderDetail({ group = baseGroup, memberId = leaderMemberId, state = null } = {}) {
  mockLocation = { pathname: "/groups/41", search: "", state };
  authHooks.useAuth.mockReturnValue({
    isAuthenticated: true,
    member: memberId === null ? null : { id: memberId }
  });
  groupHooks.useGroup.mockReturnValue({
    data: group,
    error: null,
    isError: false,
    isLoading: false,
    refetch: jest.fn()
  });
  return render(<GroupDetailPage />, { wrapper: ToastProvider });
}

const prompt = () => screen.queryByRole("dialog", { name: "모집을 시작할까요?" });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  memberHooks.useInfiniteGroupMembers.mockReturnValue(idleInfinite);
  recruitmentHooks.useInfiniteRecruitments.mockReturnValue(idleInfinite);
  recruitmentHooks.useRecruitment.mockReturnValue({ data: null, isError: false, isLoading: false });
  registrationHooks.useCreateRegistration.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn()
  });
});

afterEach(() => {
  jest.useRealTimers();
});

it("Given 방금 만든 모임, When 상세가 열리면, Then 잠깐 뒤에 모집을 시작할지 묻는다", () => {
  renderDetail({ state: { justCreated: true } });

  expect(prompt()).not.toBeInTheDocument();

  act(() => jest.advanceTimersByTime(500));

  expect(prompt()).toBeVisible();
  expect(screen.getByText("모집을 시작해야 다른 사람이 이 모임에 신청할 수 있어요.")).toBeVisible();
});

it("Given 물음을 띄운 진입, When 표식을 소비하면, Then 새로고침해도 다시 뜨지 않게 지운다", () => {
  renderDetail({ state: { justCreated: true } });

  expect(mockNavigate).toHaveBeenCalledWith("/groups/41", { replace: true, state: null });
});

it("Given 물음이 떠 있을 때, When 나중에 하기를 고르면, Then 상세에 그대로 머문다", () => {
  renderDetail({ state: { justCreated: true } });
  act(() => jest.advanceTimersByTime(500));

  fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));

  expect(prompt()).not.toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalledWith(
    "/groups/41/manage/recruitments",
    expect.anything()
  );
});

it("Given 물음이 떠 있을 때, When 모집 시작하기를 고르면, Then 모집 생성 화면으로 보낸다", () => {
  renderDetail({ state: { justCreated: true } });
  act(() => jest.advanceTimersByTime(500));

  fireEvent.click(screen.getByRole("button", { name: "모집 시작하기" }));

  expect(mockNavigate).toHaveBeenCalledWith("/groups/41/manage/recruitments", {
    state: { screen: "create" }
  });
});

it("Given 그냥 들어온 방문, When 상세가 열려도, Then 아무것도 묻지 않는다", () => {
  renderDetail();

  act(() => jest.advanceTimersByTime(500));

  expect(prompt()).not.toBeInTheDocument();
});

it("Given 이미 모집 중인 모임, When 방금 만든 진입이어도, Then 묻지 않는다", () => {
  renderDetail({
    group: {
      ...baseGroup,
      activeRecruitment: {
        approvedCount: 0,
        capacity: 10,
        endsAt: null,
        id: 91,
        joinMethod: "AUTO",
        startsAt: "2026-09-01T10:00:00"
      }
    },
    state: { justCreated: true }
  });

  act(() => jest.advanceTimersByTime(500));

  expect(prompt()).not.toBeInTheDocument();
});

it("Given 모임장이 아닌 사람, When 같은 표식을 들고 와도, Then 묻지 않는다", () => {
  renderDetail({ memberId: 99, state: { justCreated: true } });

  act(() => jest.advanceTimersByTime(500));

  expect(prompt()).not.toBeInTheDocument();
});
