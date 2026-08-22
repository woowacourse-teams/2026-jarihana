import { render, screen } from "@testing-library/react";

import { LeaderAuthorityGuard } from "../../src/app/LeaderGuard";
import { useAuth } from "../../src/features/auth";
import { useGroup } from "../../src/features/group";

jest.mock("react-router", () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  useParams: () => ({ groupId: "91" })
}));

jest.mock("../../src/features/auth", () => ({
  useAuth: jest.fn()
}));

jest.mock("../../src/features/group", () => ({
  useGroup: jest.fn()
}));

jest.mock("../../src/shared/ui", () => ({
  Button: ({ children, ...properties }) => <button {...properties}>{children}</button>,
  ErrorState: ({ title }) => <p>{title}</p>,
  ForbiddenState: ({ title }) => <p>{title}</p>,
  NotFoundState: ({ action, description, title }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  ),
  Skeleton: (properties) => <div role="status" {...properties} />
}));

it("renders a leader page only when the server detail names the current member", () => {
  // Given
  useAuth.mockReturnValue({ member: { id: 31 }, status: "authenticated" });
  useGroup.mockReturnValue({
    data: { leader: { memberId: 31 } },
    error: null,
    isPending: false
  });

  // When
  render(
    <LeaderAuthorityGuard>
      <p>모임장 화면</p>
    </LeaderAuthorityGuard>
  );

  // Then
  expect(screen.getByText("모임장 화면")).toBeInTheDocument();
});

it("renders a forbidden state for a signed-in non-leader", () => {
  // Given
  useAuth.mockReturnValue({ member: { id: 31 }, status: "authenticated" });
  useGroup.mockReturnValue({
    data: { leader: { memberId: 44 } },
    error: null,
    isPending: false
  });

  // When
  render(
    <LeaderAuthorityGuard>
      <p>모임장 화면</p>
    </LeaderAuthorityGuard>
  );

  // Then
  expect(screen.getByText("모임장만 이용할 수 있어요")).toBeInTheDocument();
  expect(screen.queryByText("모임장 화면")).not.toBeInTheDocument();
});

it("waits for the server authority response before exposing leader content", () => {
  // Given
  useAuth.mockReturnValue({ member: { id: 31 }, status: "authenticated" });
  useGroup.mockReturnValue({ data: undefined, error: null, isPending: true });

  // When
  render(
    <LeaderAuthorityGuard>
      <p>모임장 화면</p>
    </LeaderAuthorityGuard>
  );

  // Then
  expect(screen.getByRole("status", { name: "모임장 권한 확인 중" })).toBeInTheDocument();
  expect(screen.queryByText("모임장 화면")).not.toBeInTheDocument();
});

it("treats a server 403 as authoritative even before a client identity comparison", () => {
  // Given
  useAuth.mockReturnValue({ member: { id: 31 }, status: "authenticated" });
  useGroup.mockReturnValue({
    data: undefined,
    error: { status: 403 },
    isPending: false,
    refetch: jest.fn()
  });

  // When
  render(
    <LeaderAuthorityGuard>
      <p>모임장 화면</p>
    </LeaderAuthorityGuard>
  );

  // Then
  expect(screen.getByText("모임장만 이용할 수 있어요")).toBeInTheDocument();
  expect(screen.queryByText("모임장 화면")).not.toBeInTheDocument();
});

it("renders a safe not-found state with a group-list link for a server 404", () => {
  // Given
  useAuth.mockReturnValue({ member: { id: 31 }, status: "authenticated" });
  useGroup.mockReturnValue({
    data: undefined,
    error: { message: "raw backend detail must not render", status: 404 },
    isPending: false,
    refetch: jest.fn()
  });

  // When
  render(
    <LeaderAuthorityGuard>
      <p>모임장 화면</p>
    </LeaderAuthorityGuard>
  );

  // Then
  expect(screen.getByRole("heading", { name: "모임을 찾을 수 없어요" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "모임 목록으로" })).toHaveAttribute("href", "/groups");
  expect(screen.queryByText("raw backend detail must not render")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  expect(screen.queryByText("모임장 화면")).not.toBeInTheDocument();
});
