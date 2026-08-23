import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import { useAuth } from "../../../src/features/auth/index.js";
import { useInfiniteGroups } from "../../../src/features/group/index.js";
import { useInfiniteMyRegistrations } from "../../../src/features/registration/index.js";
import { MyPage } from "../../../src/pages/account/index.js";

jest.mock("react-router", () => ({
  MemoryRouter: ({ children }) => children,
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}));
jest.mock("../../../src/features/auth/index.js", () => ({ useAuth: jest.fn() }), { virtual: true });
jest.mock("../../../src/features/group/index.js", () => ({ useInfiniteGroups: jest.fn() }));
jest.mock("../../../src/features/registration/index.js", () => ({
  useInfiniteMyRegistrations: jest.fn()
}));

const MEMBER = {
  id: 11,
  crewName: "자리",
  generation: 3,
  course: "FRONTEND",
  avatarUrl: "https://avatars.githubusercontent.com/u/11"
};

const JOINED_GROUP = {
  id: 31,
  type: "STUDY",
  status: "ACTIVE",
  name: "React 깊게 보기",
  introduction: "매주 함께 읽고 실험해요.",
  representativeImageUrl: "/images/default-group.png",
  leader: { memberId: 7, crewName: "하나", generation: 2 },
  memberCount: 8,
  activeRecruitment: null
};

const MORE_JOINED_GROUPS = [
  JOINED_GROUP,
  { ...JOINED_GROUP, id: 32, name: "웹 성능 연구회" },
  { ...JOINED_GROUP, id: 33, name: "디자인 시스템 모임" }
];

const LED_GROUP = { ...JOINED_GROUP, id: 34, name: "운영 중인 접근성 모임" };
const ENDED_LED_GROUP = {
  ...LED_GROUP,
  id: 35,
  name: "종료된 접근성 모임",
  status: "ENDED"
};

const REGISTRATION = {
  id: 51,
  group: { id: 44, name: "접근성 연구회" },
  recruitmentId: 61,
  message: "함께 배우고 싶어요.",
  status: "PENDING",
  registeredAt: "2026-08-21T11:00:00",
  decisionReason: null,
  decidedAt: null,
  decidedBy: null
};

describe("MyPage", () => {
  it("Given a completed member with activity, When My renders, Then real activity fills a dense board with cursor-backed paging", async () => {
    // Given
    const fetchNextPage = jest.fn();
    useAuth.mockReturnValue({ status: "authenticated", member: MEMBER });
    useInfiniteGroups.mockImplementation(({ role, status }) => ({
      data: {
        pages: [
          {
            items:
              role !== "LEADER"
                ? MORE_JOINED_GROUPS
                : status === "ENDED"
                  ? [ENDED_LED_GROUP]
                  : [LED_GROUP],
            nextCursor: role === "LEADER" ? null : "more",
            hasNext: role !== "LEADER"
          }
        ]
      },
      isLoading: false,
      isError: false,
      hasNextPage: role !== "LEADER",
      fetchNextPage
    }));
    useInfiniteMyRegistrations.mockReturnValue({
      data: { pages: [{ items: [REGISTRATION], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false
    });
    const user = userEvent.setup();

    // When
    render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    );

    // Then
    expect(screen.getByRole("heading", { name: "마이페이지" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "자리" })).toBeVisible();
    fireEvent.error(screen.getByRole("img", { name: "자리 프로필" }));
    expect(screen.getByRole("img", { name: "자리 기본 프로필" })).toHaveTextContent("자");
    expect(screen.queryByRole("navigation", { name: "내 자리 메뉴" })).not.toBeInTheDocument();
    expect(screen.getByText("3기 · 프론트엔드")).toBeVisible();
    expect(screen.queryByRole("button", { name: /수정/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /React 깊게 보기/ })).toHaveAttribute(
      "href",
      "/groups/31"
    );
    expect(screen.getByRole("link", { name: /React 깊게 보기 상세보기/ })).toHaveAttribute(
      "href",
      "/groups/31"
    );
    expect(screen.queryByRole("link", { name: /React 깊게 보기 모임 관리/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /React 깊게 보기/ }).querySelector(".activity-row__arrow")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /접근성 연구회/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /3\+.*가입한 모임/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("link", { name: /디자인 시스템 모임/ })).toBeVisible();
    expect(screen.getByRole("tabpanel", { name: /가입한 모임/ })).toBeVisible();
    expect(screen.getByText("가입한 모임")).toHaveClass("dashboard-counts__label");
    expect(screen.getByText("운영하는 모임")).toHaveClass("dashboard-counts__label");

    await user.click(screen.getByRole("tab", { name: /신청한 모임/ }));
    expect(screen.getByRole("link", { name: /접근성 연구회/ })).toHaveAttribute(
      "href",
      "/groups/44"
    );
    expect(screen.queryByRole("link", { name: /접근성 연구회 모임 관리/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /React 깊게 보기/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /운영하는 모임/ }));
    expect(screen.getByRole("link", { name: /운영 중인 접근성 모임 상세보기/ })).toHaveAttribute(
      "href",
      "/groups/34"
    );
    expect(screen.getByRole("link", { name: /운영 중인 접근성 모임 모임 관리/ })).toHaveAttribute(
      "href",
      "/groups/34/manage"
    );
    expect(screen.getByRole("link", { name: /종료된 접근성 모임 상세보기/ })).toHaveAttribute(
      "href",
      "/groups/35"
    );
    expect(screen.getByText("모임 종료")).toBeVisible();
    expect(screen.getByRole("link", { name: /종료된 접근성 모임 모임 관리/ })).toHaveAttribute(
      "href",
      "/groups/35/manage"
    );
    expect(screen.queryByRole("link", { name: /접근성 연구회/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /가입한 모임/ }));
    await user.click(screen.getByRole("button", { name: "다음 활동 불러오기" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct empty state for each local group tab", async () => {
    useAuth.mockReturnValue({ status: "authenticated", member: MEMBER });
    useInfiniteGroups.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn()
    });
    useInfiniteMyRegistrations.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: jest.fn()
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MyPage />
      </MemoryRouter>
    );

    expect(screen.getByText("가입한 모임이 없습니다.")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: /신청한 모임/ }));
    expect(screen.getByText("신청한 모임이 없습니다.")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: /운영하는 모임/ }));
    expect(screen.getByText("운영하는 모임이 없습니다.")).toBeVisible();
  });
});
