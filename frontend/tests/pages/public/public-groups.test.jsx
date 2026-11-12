import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as authHooks from "../../../src/features/auth/index.js";
import * as groupHooks from "../../../src/features/group/index.js";
import * as memberHooks from "../../../src/features/member/index.js";
import * as recruitmentHooks from "../../../src/features/recruitment/index.js";
import * as registrationHooks from "../../../src/features/registration/index.js";
import { GroupDetailPage } from "../../../src/pages/groups/GroupDetailPage.jsx";
import { RecruitmentDetailPage } from "../../../src/pages/groups/RecruitmentDetailPage.jsx";
import { captureEvent, getPromotionAttribution } from "../../../src/shared/analytics/index.js";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";

let mockRouteParams = {};
let mockLocation;
let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = jest.fn((next) => {
  mockSearchParams = new URLSearchParams(next);
});

jest.mock("../../../src/pages/groups/GroupClubhouse.jsx", () => ({
  ...jest.requireActual("../../../src/pages/groups/GroupClubhouse.jsx"),
  __esModule: true,
  default: ({ children, group }) => <><h1 id="group-title" tabIndex={-1}>{group.name}</h1>{children}</>
}));

jest.mock(
  "react-router",
  () => ({
    Link: ({ children, to, viewTransition: _viewTransition, preventScrollReset: _preventScrollReset, ...props }) => (
      <a href={typeof to === "string" ? to : "/"} {...props}>
        {children}
      </a>
    ),
    Navigate: ({ to }) => <span>{to.pathname}{to.search}{to.hash}</span>,
    useLocation: () => mockLocation,
    useNavigate: () => jest.fn(),
    useParams: () => mockRouteParams,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams]
  })
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
  useCreateRegistration: jest.fn(),
  useWithdrawRegistration: jest.fn()
}));
jest.mock("../../../src/features/auth/index.js", () => ({ useAuth: jest.fn() }));
jest.mock("../../../src/features/activity-post/hooks.js", () => ({ useInfiniteActivityPosts: () => ({ data: { pages: [] } }) }));
jest.mock("../../../src/shared/analytics/index.js", () => ({
  captureEvent: jest.fn(),
  getPromotionAttribution: jest.fn()
}));

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
  mockLocation = { pathname: url.pathname, search: url.search, hash: url.hash, state: null };
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
    error: null,
    reset: jest.fn()
  });
  registrationHooks.useWithdrawRegistration.mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false
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

  const button = screen.getByRole("button", { name: "참여 완료!" });
  expect(button).toBeDisabled();
  await user.click(button);
  expect(mutateAsync).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("Given an active recruitment, when the detail page opens, then its entry opens recruitment information", async () => {
  const user = userEvent.setup();

  renderAt("/groups/41", <GroupDetailPage />);

  const entryElement = document.querySelector(".group-detail-web__actions .group-recruitment-entry");
  expect(entryElement).toBeInTheDocument();
  const entry = within(entryElement);
  const button = entry.getByRole("button", { name: "모집 정보" });
  expect(button).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "recruitment_details_open"
  );

  await user.click(button);

  const recruitmentDialog = screen.getByRole("dialog", { name: "모집 정보" });
  expect(recruitmentDialog).toBeInTheDocument();
  expect(within(recruitmentDialog).getByRole("region", { name: "모집 상세 정보" })).toBeVisible();
  expect(within(recruitmentDialog).queryByText("모집 중")).not.toBeInTheDocument();
});

it("Given no active recruitment, when the detail page opens, then the entry opens the empty recruitment state", async () => {
  const user = userEvent.setup();
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, activeRecruitment: null },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  const button = screen.getByRole("button", { name: "모집 정보" });
  expect(button).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "recruitment_details_open"
  );

  await user.click(button);

  const recruitmentDialog = screen.getByRole("dialog", { name: "모집 정보" });
  expect(within(recruitmentDialog).getByRole("heading", { name: "자리없음" })).toBeVisible();
});

it("shows the session's representative photo and keeps the group detail tabs", () => {
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, type: "SESSION", representativeImageUrl: "/images/session-cover.webp" }
  });

  renderAt("/groups/41", <GroupDetailPage />);

  const hero = screen.getByRole("region", { name: group.name });
  expect(hero.querySelector("img")).toHaveAttribute("src", "/images/session-cover.webp");
  expect(screen.getByRole("tab", { name: "활동 기록" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "놀러가기" })).not.toBeInTheDocument();
});

it("redirects a session's legacy space URL to its detail and preserves the tab", () => {
  groupHooks.useGroup.mockReturnValue({ data: { ...group, type: "SESSION" } });

  renderAt("/groups/41/space?tab=calendar#schedule", <GroupDetailPage />);

  expect(screen.getByText("/groups/41?tab=calendar#schedule")).toBeVisible();
});

it.each([
  ["STUDY", "자리하기"],
  ["CLUB", "자리하기"],
  ["SESSION", "자리하기"]
])(
  "Given a %s group with an active recruitment, when the application form opens, then neutral application wording is used",
  async (type, actionLabel) => {
    const user = userEvent.setup();
    groupHooks.useGroup.mockReturnValue({
      data: { ...group, type },
      isLoading: false,
      isError: false
    });

    renderAt("/groups/41", <GroupDetailPage />);

    const entry = within(document.querySelector(".group-recruitment-entry"));
    await user.click(entry.getByRole("button", { name: "모집 정보" }));

    const recruitmentDialog = screen.getByRole("dialog", { name: "모집 정보" });
    await user.click(within(recruitmentDialog).getByRole("button", { name: actionLabel }));

    const dialog = screen.getByRole("dialog", { name: "신청" });
    expect(within(dialog).getByRole("heading", { name: "신청" })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "신청 메시지" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "신청하기" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("가입");
    expect(dialog).not.toHaveTextContent("참여");
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      "registration_started",
      expect.objectContaining({ group_id: 41, recruitment_id: 91 })
    );
  }
);

it("records group-detail application start with session promotion attribution", async () => {
  const user = userEvent.setup();
  getPromotionAttribution.mockReturnValue({
    group_id: "41",
    promotion_id: "yutnori_chat_01"
  });

  renderAt("/groups/41", <GroupDetailPage />);
  const entry = within(document.querySelector(".group-recruitment-entry"));
  await user.click(entry.getByRole("button", { name: "모집 정보" }));
  const recruitmentDialog = screen.getByRole("dialog", { name: "모집 정보" });
  await user.click(within(recruitmentDialog).getByRole("button", { name: "자리하기" }));

  expect(captureEvent).toHaveBeenCalledWith("registration_started", {
    group_id: 41,
    recruitment_id: 91,
    attribution_promotion_id: "yutnori_chat_01"
  });
});

it("records recruitment-detail application start with session promotion attribution", async () => {
  const user = userEvent.setup();
  getPromotionAttribution.mockReturnValue({
    group_id: "41",
    promotion_id: "yutnori_chat_01"
  });

  renderAt("/groups/41/recruitments/91", <RecruitmentDetailPage />);
  await user.click(screen.getByRole("button", { name: "가입 신청하기" }));

  expect(captureEvent).toHaveBeenCalledWith("registration_started", {
    group_id: "41",
    recruitment_id: "91",
    attribution_promotion_id: "yutnori_chat_01"
  });
});

it("Given a pending application, when the detail page renders, then the member can withdraw it", async () => {
  const user = userEvent.setup();
  groupHooks.useGroup.mockReturnValue({
    data: {
      ...group,
      currentMemberRegistrationId: 301,
      currentMemberRegistrationStatus: "PENDING"
    },
    isLoading: false,
    isError: false
  });
  const create = jest.fn();
  const withdraw = jest.fn().mockResolvedValue(undefined);
  registrationHooks.useCreateRegistration.mockReturnValue({
    mutateAsync: create,
    isPending: false,
    isSuccess: false,
    error: null,
    reset: jest.fn()
  });
  registrationHooks.useWithdrawRegistration.mockReturnValue({
    mutateAsync: withdraw,
    isPending: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  const button = screen.getByRole("button", { name: "신청 철회" });
  expect(button).toHaveAttribute("data-ph-capture-attribute-action", "registration_withdraw");
  await user.click(button);
  expect(screen.getByRole("dialog", { name: "신청을 철회할까요?" })).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: "철회하기" });
  expect(confirm).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "registration_withdraw_confirm"
  );
  await user.click(confirm);
  expect(withdraw).toHaveBeenCalledWith(301);
  expect(create).not.toHaveBeenCalled();
});

it("Given a pending application and full recruitment, when the detail page renders, then withdrawal is unavailable", () => {
  groupHooks.useGroup.mockReturnValue({
    data: {
      ...group,
      activeRecruitment: { ...group.activeRecruitment, approvedCount: 10 },
      currentMemberRegistrationId: 301,
      currentMemberRegistrationStatus: "PENDING"
    },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByRole("button", { name: "모집 마감" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "신청 철회" })).not.toBeInTheDocument();
});

it("Given a pending application without an ID, when the detail page renders, then the member can reach the withdrawal list", () => {
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, currentMemberRegistrationStatus: "PENDING" },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  expect(screen.getByRole("link", { name: "내 신청에서 철회" })).toHaveAttribute(
    "href",
    "/my/registrations"
  );
});

it.each(["APPROVED", "REJECTED"])(
  "Given a %s application, when the detail page renders, then withdrawal is unavailable",
  (status) => {
    groupHooks.useGroup.mockReturnValue({
      data: {
        ...group,
        currentMemberRegistrationId: 301,
        currentMemberRegistrationStatus: status
      },
      isLoading: false,
      isError: false
    });

    renderAt("/groups/41", <GroupDetailPage />);

    expect(screen.queryByRole("button", { name: "신청 철회" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "내 신청에서 철회" })).not.toBeInTheDocument();
  }
);

it("Given no active recruitment, when group detail renders, then its recruitment card shows the empty state", () => {
  groupHooks.useGroup.mockReturnValue({
    data: { ...group, activeRecruitment: null },
    isLoading: false,
    isError: false
  });

  renderAt("/groups/41", <GroupDetailPage />);

  const rail = screen.getByRole("complementary", { name: "운영자, 모집 정보와 일정" });
  expect(within(rail).getByText("모집 준비 중")).toBeInTheDocument();
  expect(screen.queryByText("현재 진행 중인 모집이 없어요")).not.toBeInTheDocument();
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
