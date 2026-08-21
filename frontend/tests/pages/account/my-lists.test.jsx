import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router";
import { ToastProvider } from "../../../src/shared/ui/index.js";

import { useInfiniteGroups } from "../../../src/features/group/index.js";
import {
  useInfiniteMyRegistrations,
  useWithdrawRegistration
} from "../../../src/features/registration/index.js";
import { MyGroupsPage, MyRegistrationsPage } from "../../../src/pages/account/index.js";

jest.mock("react-router", () => ({
  MemoryRouter: ({ children }) => children,
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useSearchParams: jest.fn()
}));
jest.mock("../../../src/features/group/index.js", () => ({ useInfiniteGroups: jest.fn() }));
jest.mock("../../../src/features/registration/index.js", () => ({
  useInfiniteMyRegistrations: jest.fn(),
  useWithdrawRegistration: jest.fn()
}));

const GROUP = {
  id: 31,
  type: "STUDY",
  status: "ACTIVE",
  name: "React 깊게 보기",
  introduction: "프로젝트에서 테스트 세션을 집중적으로 운영해요.",
  representativeImageUrl: "/images/default-group.png",
  leader: { memberId: 7, crewName: "하나", generation: 2 },
  memberCount: 8,
  activeRecruitment: null
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

function PageShell({ children }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

function renderPage(page) {
  return render(<PageShell>{page}</PageShell>);
}

describe("MyGroupsPage", () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue([new URLSearchParams(), jest.fn()]);
  });

  it("Given a leader role in the URL, When My groups renders, Then the filter and backend query stay synchronized", () => {
    // Given
    useSearchParams.mockReturnValue([new URLSearchParams("role=LEADER"), jest.fn()]);
    useInfiniteGroups.mockReturnValue({
      data: { pages: [{ items: [GROUP], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false
    });

    // When
    renderPage(<MyGroupsPage />);

    // Then
    expect(screen.getByRole("combobox", { name: "모임 역할" })).toHaveValue("LEADER");
    expect(useInfiniteGroups).toHaveBeenLastCalledWith({ relation: "JOINED", role: "LEADER" });
    expect(screen.getByRole("link", { name: "React 깊게 보기 모임 상세 보기" })).toHaveClass(
      "account-card"
    );
    expect(screen.getByRole("link", { name: "React 깊게 보기 모임 상세 보기" })).toHaveAttribute(
      "href",
      "/groups/31"
    );
  });

  it("Given a cursor page, When more groups are requested, Then the next backend page is fetched", async () => {
    // Given
    const fetchNextPage = jest.fn();
    useInfiniteGroups.mockReturnValue({
      data: { pages: [{ items: [GROUP], nextCursor: "opaque-next", hasNext: true }] },
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage
    });
    const user = userEvent.setup();
    renderPage(<MyGroupsPage />);

    // When
    await user.click(screen.getByRole("button", { name: "모임 더 보기" }));

    // Then
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("Given a failed group query, When the page renders, Then recovery is available", async () => {
    // Given
    const refetch = jest.fn();
    useInfiniteGroups.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch
    });
    const user = userEvent.setup();
    renderPage(<MyGroupsPage />);

    // When
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    // Then
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("MyRegistrationsPage", () => {
  it("Given registrations, When a status filter changes, Then the selected backend status is queried", async () => {
    // Given
    useInfiniteMyRegistrations.mockReturnValue({
      data: { pages: [{ items: [REGISTRATION], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false
    });
    useWithdrawRegistration.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    const user = userEvent.setup();
    renderPage(<MyRegistrationsPage />);

    // When
    await user.selectOptions(screen.getByRole("combobox", { name: "신청 상태" }), "APPROVED");

    // Then
    expect(useInfiniteMyRegistrations).toHaveBeenLastCalledWith({
      applicant: "me",
      status: "APPROVED"
    });
  });

  it("Given a pending registration, When withdrawal is confirmed, Then it disappears behind a pending lock after success", async () => {
    // Given
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    useInfiniteMyRegistrations.mockReturnValue({
      data: { pages: [{ items: [REGISTRATION], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false
    });
    useWithdrawRegistration.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    const view = renderPage(<MyRegistrationsPage />);

    // When
    await user.click(screen.getByRole("button", { name: "신청 철회" }));
    await user.click(screen.getByRole("button", { name: "철회하기" }));

    // Then
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(51));
    useInfiniteMyRegistrations.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, hasNext: false }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false
    });
    view.rerender(
      <PageShell>
        <MyRegistrationsPage />
      </PageShell>
    );
    expect(screen.queryByRole("button", { name: "신청 철회" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "신청 목록" })).toHaveFocus());
  });
});
