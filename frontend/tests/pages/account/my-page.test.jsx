import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useAuth } from "../../../src/features/auth/index.js";
import { useInfiniteGroups } from "../../../src/features/group/index.js";
import { useInfiniteMyRegistrations } from "../../../src/features/registration/index.js";
import { MyPage } from "../../../src/pages/account/MyPage.jsx";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={typeof to === "string" ? to : "/"} {...props}>
      {children}
    </a>
  )
}));
jest.mock("../../../src/features/auth/index.js", () => ({ useAuth: jest.fn() }));
jest.mock("../../../src/features/group/index.js", () => ({ useInfiniteGroups: jest.fn() }));
jest.mock("../../../src/features/registration/index.js", () => ({
  useInfiniteMyRegistrations: jest.fn()
}));

const member = {
  avatarUrl: null,
  course: "FRONTEND",
  crewName: "자리",
  generation: 8,
  id: 7,
  memberType: "CREW"
};

const sessionGroup = {
  id: 101,
  type: "SESSION",
  status: "ACTIVE",
  name: "한 번 만나요",
  introduction: "가볍게 만나 서로의 관심사를 나눠요.",
  representativeImageUrl: null,
  recurringSchedule: null,
  sessionSchedule: null,
  leader: { memberId: 7 },
  memberCount: 4
};

const recurringGroup = {
  id: 102,
  type: "STUDY",
  status: "ACTIVE",
  name: "꾸준한 프론트엔드 스터디",
  introduction: "매주 한 주제를 깊게 공부해요.",
  representativeImageUrl: null,
  recurringSchedule: null,
  sessionSchedule: null,
  leader: { memberId: 18 },
  memberCount: 6
};

const pendingRegistration = {
  id: 201,
  group: { id: 101, name: sessionGroup.name, representativeImageUrl: null },
  message: "함께 이야기 나누고 싶어요.",
  registeredAt: "2026-09-01T12:00:00",
  rejectReason: null,
  status: "PENDING"
};

const rejectedRegistration = {
  id: 202,
  group: { id: 102, name: recurringGroup.name, representativeImageUrl: null },
  message: "꾸준히 참여하고 싶어요.",
  registeredAt: "2026-09-02T12:00:00",
  rejectReason: "이번 모집의 정원이 모두 찼습니다.",
  status: "REJECTED"
};

function queryWithItems(items) {
  return {
    data: { pages: [{ hasNext: false, items, nextCursor: null }] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false
  };
}

function renderMyPage({ groups = [sessionGroup, recurringGroup], pending = [pendingRegistration], rejected = [rejectedRegistration], path = "/my" } = {}) {
  const activeGroupsQuery = queryWithItems(groups);
  const endedGroupsQuery = queryWithItems([]);
  const pendingQuery = queryWithItems(pending);
  const rejectedQuery = queryWithItems(rejected);

  window.history.replaceState({}, "", path);
  useInfiniteGroups.mockImplementation(({ status }) =>
    status === "ENDED" ? endedGroupsQuery : activeGroupsQuery
  );
  useInfiniteMyRegistrations.mockImplementation(({ status }) =>
    status === "REJECTED" ? rejectedQuery : pendingQuery
  );
  useAuth.mockReturnValue({ member });

  return render(<MyPage />);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, "", "/my");
});

describe("MyPage", () => {
  it("모임과 신청을 별도 카드로 나누고 각각의 탭에 맞는 항목을 보여 준다", async () => {
    const user = userEvent.setup();
    renderMyPage();

    expect(screen.getByRole("heading", { name: "내 모임", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "내 신청", exact: true })).toBeInTheDocument();

    const sessionPanel = screen.getByRole("tabpanel", { name: /같이해요/ });
    expect(within(sessionPanel).getByRole("link", { name: "한 번 만나요" })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "my_group_detail_open"
    );
    expect(within(sessionPanel).queryByText(recurringGroup.name)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /동아리·스터디/ }));

    const recurringPanel = screen.getByRole("tabpanel", { name: /동아리·스터디/ });
    expect(within(recurringPanel).getByText(recurringGroup.name)).toBeInTheDocument();
    expect(within(recurringPanel).queryByText(sessionGroup.name)).not.toBeInTheDocument();

    const pendingPanel = screen.getByRole("tabpanel", { name: /검토 중/ });
    expect(within(pendingPanel).getByText(sessionGroup.name)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /거절됨/ }));

    const rejectedPanel = screen.getByRole("tabpanel", { name: /거절됨/ });
    expect(within(rejectedPanel).getByText("거절 사유: 이번 모집의 정원이 모두 찼습니다.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /같이해요/ })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "my_group_type_tab_change"
    );
    expect(screen.getByRole("tab", { name: /거절됨/ })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "my_registration_status_tab_change"
    );
  });

  it("유형별 빈 상태 링크와 기존 모임 유형 복귀 쿼리를 유지한다", async () => {
    const user = userEvent.setup();
    renderMyPage({ groups: [], pending: [], rejected: [], path: "/my?tab=joined&groupType=STUDY" });

    expect(screen.getByRole("tab", { name: /동아리·스터디/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const recurringPanel = screen.getByRole("tabpanel", { name: /동아리·스터디/ });
    expect(within(recurringPanel).getByText("가입한 동아리·스터디가 없습니다.")).toBeInTheDocument();
    expect(within(recurringPanel).getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
      "href",
      "/groups"
    );

    await user.click(screen.getByRole("tab", { name: /같이해요/ }));

    const sessionPanel = screen.getByRole("tabpanel", { name: /같이해요/ });
    expect(within(sessionPanel).getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
      "href",
      "/groups?type=SESSION"
    );

    await user.click(screen.getByRole("tab", { name: /거절됨/ }));

    const rejectedPanel = screen.getByRole("tabpanel", { name: /거절됨/ });
    expect(within(rejectedPanel).getByText("거절된 신청이 없습니다.")).toBeInTheDocument();
    expect(within(rejectedPanel).getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
      "href",
      "/groups"
    );
  });
});
