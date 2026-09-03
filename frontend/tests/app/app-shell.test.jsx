import { fireEvent, render, screen, within } from "@testing-library/react";

import { AppShell } from "../../src/app/AppShell";
import { useAuth } from "../../src/features/auth";
import { ToastProvider } from "../../src/shared/ui/Toast.jsx";

let mockPathname = "/groups";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...properties }) => (
    <a href={to} {...properties}>
      {children}
    </a>
  ),
  NavLink: ({ children, className, to, ...properties }) => (
    <a
      className={typeof className === "function" ? className({ isActive: false }) : className}
      href={to}
      {...properties}
    >
      {children}
    </a>
  ),
  Outlet: () => null,
  useLocation: () => ({ pathname: mockPathname })
}));

jest.mock("../../src/features/auth", () => ({
  storeReturnTarget: jest.requireActual("../../src/features/auth/returnTarget").storeReturnTarget,
  useAuth: jest.fn()
}));

jest.mock("../../src/shared/ui", () => {
  const { useToast } = jest.requireActual("../../src/shared/ui/Toast.jsx");
  return {
    Drawer: ({ children, onClose, open, title }) =>
      open ? (
        <div aria-label={title} role="dialog">
          <button onClick={onClose} type="button">
            닫기
          </button>
          {children}
        </div>
      ) : null,
    useToast
  };
});

function renderShell(auth) {
  useAuth.mockReturnValue(auth);
  return render(
    <ToastProvider duration={0}>
      <AppShell>
        <h1>현재 화면</h1>
      </AppShell>
    </ToastProvider>
  );
}

beforeEach(() => {
  mockPathname = "/groups";
  sessionStorage.clear();
});

it("starts GitHub login from the anonymous header action", () => {
  // Given
  const login = jest.fn();
  renderShell({ login, logout: jest.fn(), status: "anonymous" });

  // When
  fireEvent.click(screen.getByRole("button", { name: "GitHub로 로그인" }));

  // Then
  expect(login).toHaveBeenCalledTimes(1);
});

it.each([["모임 만들기", "/groups/new"]])(
  "explains that %s requires login instead of silently returning to the current page",
  (label, target) => {
    // Given
    renderShell({ login: jest.fn(), logout: jest.fn(), status: "anonymous" });

    // When
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const navigationContinues = fireEvent.click(
      within(screen.getByRole("navigation", { name: "모바일 메뉴" })).getByRole("link", {
        name: label
      })
    );

    // Then
    expect(navigationContinues).toBe(false);
    expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe(target);
    expect(screen.getByRole("status")).toHaveTextContent("로그인이 필요한 메뉴예요");
    expect(screen.getByRole("status")).toHaveTextContent("로그인한 뒤 이용할 수 있어요");
  }
);

it("keeps an incomplete signup session on the signup flow", () => {
  // Given / When
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "signup-required" });

  // Then
  expect(screen.getByRole("link", { name: "가입 계속하기" })).toHaveAttribute("href", "/signup");
});

it("shows member navigation and logs out an authenticated member", () => {
  // Given
  const logout = jest.fn();
  renderShell({ login: jest.fn(), logout, status: "authenticated" });

  // When
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

  // Then
  expect(
    within(screen.getByRole("navigation", { name: "주요 메뉴" })).queryAllByRole("link")
  ).toHaveLength(0);
  expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/my");
  expect(logout).toHaveBeenCalledTimes(1);
});
