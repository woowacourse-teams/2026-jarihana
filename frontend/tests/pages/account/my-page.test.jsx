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
  sessionSchedule: {
    sessionDate: "2026-09-30",
    startTime: "19:00",
    endTime: "21:00"
  },
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
  recurringSchedule: {
    daysOfWeek: ["MONDAY", "WEDNESDAY"],
    startTime: "20:00",
    endTime: "22:00"
  },
  sessionSchedule: null,
  leader: { memberId: 18 },
  memberCount: 6
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

function renderMyPage({ groups = [sessionGroup, recurringGroup], registrations = [] } = {}) {
  const activeGroupsQuery = queryWithItems(groups);
  const endedGroupsQuery = queryWithItems([]);
  const registrationsQuery = queryWithItems(registrations);

  useInfiniteGroups.mockImplementation(({ status }) =>
    status === "ENDED" ? endedGroupsQuery : activeGroupsQuery
  );
  useInfiniteMyRegistrations.mockReturnValue(registrationsQuery);
  useAuth.mockReturnValue({ member });

  return render(<MyPage />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MyPage", () => {
  it("가입한 모임을 같이해요와 동아리·스터디 영역으로 나누고 유형별 정보를 보여 준다", () => {
    renderMyPage();

    const sessionSection = screen.getByRole("group", { name: "같이해요" });
    const recurringSection = screen.getByRole("group", { name: "동아리·스터디" });

    expect(within(sessionSection).getByRole("link", { name: "한 번 만나요" })).toHaveAttribute(
      "href",
      "/groups/101"
    );
    expect(within(sessionSection).getByText("2026.09.30 · 19:00–21:00")).toBeInTheDocument();
    expect(
      within(sessionSection).getByRole("link", { name: "한 번 만나요 모임 관리" })
    ).toHaveAttribute("href", "/groups/101/manage");
    expect(within(sessionSection).getByRole("link", { name: "한 번 만나요" })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "my_group_detail_open"
    );

    expect(
      within(recurringSection).getByRole("link", { name: "꾸준한 프론트엔드 스터디" })
    ).toBeInTheDocument();
    expect(within(recurringSection).getByText("매주 월·수 · 20:00–22:00")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /가입한 모임/ })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "my_activity_tab_change"
    );
  });

  it("유형별 빈 상태와 탐색 링크를 보여 주고 신청 탭도 유지한다", async () => {
    const user = userEvent.setup();
    renderMyPage({ groups: [] });

    const sessionSection = screen.getByRole("group", { name: "같이해요" });
    const recurringSection = screen.getByRole("group", { name: "동아리·스터디" });

    expect(within(sessionSection).getByText("가입한 같이해요가 없습니다.")).toBeInTheDocument();
    expect(within(recurringSection).getByText("가입한 동아리·스터디가 없습니다.")).toBeInTheDocument();
    expect(within(sessionSection).getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
      "href",
      "/groups?type=SESSION"
    );
    expect(within(sessionSection).getByRole("link", { name: "모임 둘러보기" })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "my_session_empty_explore"
    );

    await user.click(screen.getByRole("tab", { name: /신청한 모임/ }));

    expect(screen.getByText("신청한 모임이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("가입한 같이해요가 없습니다.")).not.toBeInTheDocument();
  });
});
