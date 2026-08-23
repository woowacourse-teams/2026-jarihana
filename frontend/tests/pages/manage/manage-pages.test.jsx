import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ManageMembersPage,
  ManageRecruitmentsPage,
  ManageRegistrationsPage
} from "../../../src/pages/manage/index.js";
import { useInfiniteGroupMembers, useTransferLeader } from "../../../src/features/member/index.js";
import { useGroup } from "../../../src/features/group/index.js";
import {
  useCloseRecruitment,
  useCreateRecruitment,
  useInfiniteRecruitments,
  useRecruitment
} from "../../../src/features/recruitment/index.js";
import {
  useDecideRegistration,
  useInfiniteRegistrations
} from "../../../src/features/registration/index.js";
import { useParams } from "react-router";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a {...properties} href={to}>
      {children}
    </a>
  ),
  useParams: jest.fn()
}));

jest.mock("../../../src/features/member/index.js", () => ({
  useInfiniteGroupMembers: jest.fn(),
  useTransferLeader: jest.fn()
}));

jest.mock("../../../src/features/group/index.js", () => ({
  useGroup: jest.fn()
}));

jest.mock("../../../src/features/recruitment/index.js", () => ({
  useCloseRecruitment: jest.fn(),
  useCreateRecruitment: jest.fn(),
  useInfiniteRecruitments: jest.fn(),
  useRecruitment: jest.fn()
}));

jest.mock("../../../src/features/registration/index.js", () => ({
  useDecideRegistration: jest.fn(),
  useInfiniteRegistrations: jest.fn()
}));

const queryResult = (items) => ({
  data: { pages: [{ hasNext: false, items, nextCursor: null }] },
  error: null,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isPending: false,
  refetch: jest.fn()
});

const memberFixture = {
  course: "FRONTEND",
  crewName: "링크로",
  generation: 8,
  groupMemberId: 42,
  joinedAt: "2026-08-01T10:00:00",
  memberId: 99,
  role: "MEMBER"
};

const recruitmentFixture = {
  approvedCount: 4,
  capacity: 10,
  createdAt: "2026-08-10T09:00:00",
  endsAt: "2026-08-25T23:59:00",
  id: 81,
  joinMethod: "APPROVAL",
  recruitingStatus: "OPEN",
  startsAt: "2026-08-10T00:00:00"
};

const registrationFixture = {
  decidedAt: null,
  decidedBy: null,
  decisionReason: null,
  id: 72,
  member: { course: "FRONTEND", crewName: "개발자재키", generation: 8, id: 17 },
  message: "프론트 성능을 깊이 보고 싶어요.",
  registeredAt: "2026-08-21T11:00:00",
  status: "PENDING"
};

beforeEach(() => {
  jest.clearAllMocks();
  useParams.mockReturnValue({ groupId: "7", recruitmentId: "81" });
  useGroup.mockReturnValue({
    data: { id: 7, memberCount: 1, name: "프론트엔드 성능 튜닝 챌린지", status: "ACTIVE" }
  });
  useInfiniteGroupMembers.mockReturnValue(queryResult([memberFixture]));
  useTransferLeader.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });
  useInfiniteRecruitments.mockReturnValue(queryResult([recruitmentFixture]));
  useRecruitment.mockReturnValue({
    data: recruitmentFixture,
    error: null,
    isError: false,
    isPending: false,
    refetch: jest.fn()
  });
  useCreateRecruitment.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });
  useCloseRecruitment.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });
  useInfiniteRegistrations.mockReturnValue(queryResult([registrationFixture]));
  useDecideRegistration.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });
});

describe("ManageMembersPage", () => {
  it("Given the full member DTO, When rendered, Then it exposes every server-owned member field and no expulsion action", () => {
    render(<ManageMembersPage />);

    const row = screen.getByRole("row", { name: "링크로 멤버" });
    expect(within(row).getByText("프론트엔드")).toBeVisible();
    expect(within(row).getByText("8기")).toBeVisible();
    expect(within(row).getByText("멤버")).toBeVisible();
    expect(within(row).getByText("2026. 8. 1.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /내보내기/ })).not.toBeInTheDocument();
  });

  it("Given group context, When rendered, Then it exposes the Figma management header, local tabs, and dense member table", () => {
    render(<ManageMembersPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "프론트엔드 성능 튜닝 챌린지" })
    ).toBeVisible();
    const navigation = screen.getByRole("navigation", { name: "모임 관리 메뉴" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["모임 수정", "모집 관리", "신청 관리", "멤버 관리"]);
    expect(within(navigation).getByRole("link", { name: "멤버 관리" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByText("모임장 관리")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "모임 멤버" })).toBeVisible();
  });

  it("Given a member, When leader transfer is confirmed, Then it sends only the group-member identifier", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({ leaderGroupMemberId: 42 });
    useTransferLeader.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageMembersPage />);

    await user.click(screen.getByRole("button", { name: "링크로에게 모임장 넘기기" }));
    expect(screen.getByRole("dialog", { name: "모임장을 넘길까요?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "모임장 넘기기" }));

    expect(mutateAsync).toHaveBeenCalledWith({ groupMemberId: 42 });
  });
});

describe("ManageRecruitmentsPage", () => {
  it("Given an archived group, When the recruitment tab is rendered, Then history remains visible and creation is disabled", () => {
    const mutateAsync = jest.fn();
    useGroup.mockReturnValue({
      data: {
        id: 7,
        memberCount: 1,
        name: "프론트엔드 성능 튜닝 챌린지",
        status: "ENDED"
      }
    });
    useCreateRecruitment.mockReturnValue({ isPending: false, mutateAsync });

    render(<ManageRecruitmentsPage />);

    const navigation = screen.getByRole("navigation", { name: "모임 관리 메뉴" });
    expect(within(navigation).getByRole("link", { name: "모집 관리" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByRole("region", { name: "모집 현황 요약" })).not.toBeInTheDocument();
    expect(screen.getByText("아카이빙된 모임은 새 모집을 만들 수 없어요.")).toBeVisible();
    expect(screen.getByLabelText("모집 시작")).toBeDisabled();
    expect(screen.getByRole("button", { name: "모집 조건 저장" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "81번 모집" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "81번 모집 마감하기" })).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole("form", { name: "새 모집 만들기" }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("Given valid local date-time values, When a recruitment is created, Then it sends the exact backend payload", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 83 });
    useCreateRecruitment.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageRecruitmentsPage />);

    await user.selectOptions(screen.getByRole("combobox", { name: "가입 방식" }), "APPROVAL");
    await user.clear(screen.getByRole("spinbutton", { name: "모집 정원" }));
    await user.type(screen.getByRole("spinbutton", { name: "모집 정원" }), "12");
    await user.type(screen.getByLabelText("모집 시작"), "2026-09-01T10:00");
    await user.type(screen.getByLabelText("모집 마감 (선택)"), "2026-09-10T23:59");
    await user.click(screen.getByRole("button", { name: "모집 조건 저장" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      capacity: 12,
      endsAt: "2026-09-10T23:59",
      joinMethod: "APPROVAL",
      startsAt: "2026-09-01T10:00"
    });
  });

  it("Given an open recruitment, When closing is confirmed, Then it sends CLOSED and keeps a tolerant status surface", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({
      endsAt: "2026-08-21T12:00:00",
      id: 81,
      recruitingStatus: "UPCOMING"
    });
    useCloseRecruitment.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageRecruitmentsPage />);

    await user.click(screen.getByRole("button", { name: "81번 모집 마감하기" }));
    await user.click(screen.getByRole("button", { name: "모집 마감하기" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      recruitmentId: 81,
      recruitingStatus: "CLOSED"
    });
  });

  it("Given a create request in flight, When the form is submitted twice rapidly, Then it sends only one request", async () => {
    let resolveMutation;
    const mutateAsync = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        })
    );
    useCreateRecruitment.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageRecruitmentsPage />);

    fireEvent.change(screen.getByLabelText("모집 시작"), {
      target: { value: "2026-09-01T10:00" }
    });
    const submit = screen.getByRole("button", { name: "모집 조건 저장" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "모집 조건 저장 처리 중" })).toBeDisabled();

    await act(async () => resolveMutation({ id: 83 }));
  });
});

describe("ManageRegistrationsPage", () => {
  it("Given a pending applicant, When approved, Then it sends APPROVED and omits the decision reason", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 72, status: "APPROVED" });
    useDecideRegistration.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageRegistrationsPage />);

    await user.click(screen.getByRole("button", { name: "개발자재키 승인" }));
    await user.click(screen.getByRole("button", { name: "신청 승인하기" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      registrationId: 72,
      status: "APPROVED"
    });
  });

  it("Given a pending applicant, When rejected with a reason, Then it sends REJECTED with that optional reason", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 72, status: "REJECTED" });
    useDecideRegistration.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageRegistrationsPage />);

    await user.click(screen.getByRole("button", { name: "개발자재키 거절" }));
    await user.type(
      screen.getByRole("textbox", { name: "거절 사유 (선택)" }),
      "이번 정원이 마감됐어요."
    );
    await user.click(screen.getByRole("button", { name: "신청 거절하기" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      decisionReason: "이번 정원이 마감됐어요.",
      registrationId: 72,
      status: "REJECTED"
    });
  });

  it("Given a filter selection, When changed, Then the server hook receives the exact status", async () => {
    const user = userEvent.setup();
    render(<ManageRegistrationsPage />);

    await user.click(screen.getByRole("button", { name: "거절" }));

    expect(useInfiniteRegistrations).toHaveBeenLastCalledWith("81", { status: "REJECTED" });
  });

  it("Given router params, When rendered, Then it uses the router identifiers and a client-side management link", () => {
    useParams.mockReturnValue({ groupId: "29", recruitmentId: "93" });
    render(<ManageRegistrationsPage />);

    expect(useInfiniteRegistrations).toHaveBeenCalledWith("93", {});
    expect(screen.getByRole("link", { name: "모집 목록으로" })).toHaveAttribute(
      "href",
      "/groups/29/manage/recruitments"
    );
  });

  it("Given an active recruitment, When rendered, Then the applicant panel is directly identifiable in the management chrome", () => {
    render(<ManageRegistrationsPage />);

    const navigation = screen.getByRole("navigation", { name: "모임 관리 메뉴" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["모임 수정", "모집 관리", "신청 관리", "멤버 관리"]);
    expect(within(navigation).getByRole("link", { name: "신청 관리" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("region", { name: "신청자 목록" })).toBeVisible();
  });

  it("Given the final2 operational dashboard, When rendered, Then it uses compact filters and no redundant stat card", () => {
    render(<ManageRegistrationsPage />);

    expect(screen.getByRole("region", { name: "신청 관리 대시보드" })).toHaveClass(
      "manage-registration-layout"
    );
    const filters = screen.getByRole("group", { name: "신청 상태" });
    expect(within(filters).getByRole("button", { name: "전체" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(filters).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByLabelText("현재 신청자 1명")).not.toBeInTheDocument();
  });

  it("Given real member and recruitment queries, When rendered, Then the Figma side rail shows their live snapshot", () => {
    render(<ManageRegistrationsPage />);

    expect(useInfiniteGroupMembers).toHaveBeenCalledWith("7");
    expect(useRecruitment).toHaveBeenCalledWith("7", "81");
    const rail = screen.getByRole("complementary", { name: "운영 현황" });
    expect(within(rail).getByRole("heading", { name: "모임 멤버 1명" })).toBeVisible();
    expect(within(rail).getByText("링크로")).toBeVisible();
    expect(within(rail).getByText("모집 중")).toBeVisible();
    expect(within(rail).getByText("승인 4 / 정원 10명")).toBeVisible();
  });

  it("Given side-rail query errors, When applicants load, Then safe independent rail errors do not block decisions", () => {
    useInfiniteGroupMembers.mockReturnValue({
      ...queryResult([]),
      error: { message: "member sql leak" },
      isError: true
    });
    useRecruitment.mockReturnValue({
      data: undefined,
      error: { message: "recruitment sql leak" },
      isError: true,
      isPending: false,
      refetch: jest.fn()
    });

    render(<ManageRegistrationsPage />);

    expect(screen.getByRole("region", { name: "신청자 목록" })).toBeVisible();
    expect(screen.getByRole("button", { name: "개발자재키 승인" })).toBeEnabled();
    expect(screen.getByText("멤버 현황을 불러오지 못했어요.")).toBeVisible();
    expect(screen.getByText("모집 현황을 불러오지 못했어요.")).toBeVisible();
    expect(screen.queryByText(/sql leak/)).not.toBeInTheDocument();
  });

  it("Given a rejected decision mutation, When confirming, Then the dialog stays open and only a safe error is shown", async () => {
    const user = userEvent.setup();
    const mutateAsync = jest.fn().mockRejectedValue({
      message: "DB constraint registration_decision leaked",
      status: 409
    });
    useDecideRegistration.mockReturnValue({ isPending: false, mutateAsync });
    render(<ManageRegistrationsPage />);

    await user.click(screen.getByRole("button", { name: "개발자재키 승인" }));
    await user.click(screen.getByRole("button", { name: "신청 승인하기" }));

    expect(screen.getByRole("dialog", { name: "이 신청을 승인할까요?" })).toBeVisible();
    expect(screen.getByText("이미 처리된 요청이에요")).toBeVisible();
    expect(screen.queryByText(/DB constraint/)).not.toBeInTheDocument();
  });
});
