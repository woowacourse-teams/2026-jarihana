import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { AuthGuard } from "../../src/app/AuthGuard";
import { useAuth } from "../../src/features/auth";

const locationFixture = {
  hash: "",
  pathname: "/my/registrations",
  search: "?status=PENDING"
};
let mockNavigateUnmount = null;
let mockNavigationEvents = [];

jest.mock("react-router", () => ({
  Navigate: ({ state, to }) => {
    const { useLayoutEffect } = require("react");
    mockNavigationEvents.push("navigate");
    useLayoutEffect(() => {
      mockNavigateUnmount?.();
    }, []);
    return (
      <output data-from={state.from} data-login-required={String(state.loginRequired)}>
        {to}
      </output>
    );
  },
  useLocation: () => locationFixture
}));

jest.mock("../../src/features/auth", () => ({
  ...jest.requireActual("../../src/features/auth"),
  useAuth: jest.fn()
}));

jest.mock("../../src/shared/ui", () => ({
  Button: ({ children, ...properties }) => <button {...properties}>{children}</button>,
  ErrorState: ({ action, title }) => (
    <section>
      <h2>{title}</h2>
      {action}
    </section>
  ),
  Skeleton: (properties) => <div role="status" {...properties} />
}));

afterEach(() => {
  mockNavigateUnmount = null;
  mockNavigationEvents = [];
  jest.restoreAllMocks();
  window.sessionStorage.clear();
});

it("shows a stable loading state during auth bootstrap", () => {
  // Given
  useAuth.mockReturnValue({ status: "loading" });

  // When
  render(
    <AuthGuard>
      <p>보호된 화면</p>
    </AuthGuard>
  );

  // Then
  expect(screen.getByRole("status", { name: "로그인 상태 확인 중" })).toBeInTheDocument();
  expect(screen.queryByText("보호된 화면")).not.toBeInTheDocument();
});

it("stores an anonymous deep link before redirecting to discovery", () => {
  // Given
  useAuth.mockReturnValue({ status: "anonymous" });

  // When
  render(
    <AuthGuard>
      <p>보호된 화면</p>
    </AuthGuard>
  );

  // Then
  expect(window.sessionStorage.getItem("jarihana:auth:return-target")).toBe(
    "/my/registrations?status=PENDING"
  );
  expect(screen.getByText("/groups")).toHaveAttribute("data-login-required", "true");
});

it("renders the protected route for an authenticated member", () => {
  // Given
  useAuth.mockReturnValue({ status: "authenticated" });

  // When
  render(
    <AuthGuard>
      <p>보호된 화면</p>
    </AuthGuard>
  );

  // Then
  expect(screen.getByText("보호된 화면")).toBeInTheDocument();
});

it("offers retry without redirecting when auth bootstrap is unavailable", () => {
  // Given
  const retry = jest.fn();
  useAuth.mockReturnValue({ retry, status: "unavailable" });

  // When
  render(
    <AuthGuard>
      <p>보호된 화면</p>
    </AuthGuard>
  );
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  // Then
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("보호된 화면")).not.toBeInTheDocument();
  expect(screen.queryByText("/groups")).not.toBeInTheDocument();
});

it("persists the deep link before Navigate can unmount the guard", () => {
  // Given
  const originalSetItem = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(key, value) {
    mockNavigationEvents.push(`store:${key}`);
    return originalSetItem.call(this, key, value);
  });
  useAuth.mockReturnValue({ status: "anonymous" });

  function NavigationHarness() {
    const [active, setActive] = useState(true);
    mockNavigateUnmount = () => setActive(false);
    return active ? (
      <AuthGuard>
        <p>보호된 화면</p>
      </AuthGuard>
    ) : (
      <p>이동 완료</p>
    );
  }

  // When
  render(<NavigationHarness />);

  // Then
  expect(screen.getByText("이동 완료")).toBeInTheDocument();
  expect(window.sessionStorage.getItem("jarihana:auth:return-target")).toBe(
    "/my/registrations?status=PENDING"
  );
  expect(mockNavigationEvents).toEqual(["store:jarihana:auth:return-target", "navigate"]);
});
