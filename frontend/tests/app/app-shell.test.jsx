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

it.each([
  ["/groups", "탐색"],
  ["/groups/1", "탐색"],
  ["/groups/new", "모임 만들기"]
])("marks exactly one header menu for %s", (pathname, expectedLabel) => {
  mockPathname = pathname;
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

  const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  const currentLinks = within(navigation)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page");

  expect(currentLinks).toHaveLength(1);
  expect(currentLinks[0]).toHaveTextContent(expectedLabel);
});

it.each(["/my/groups", "/groups/1/manage/members"])(
  "does not expose or activate the removed management header menu for %s",
  (pathname) => {
    mockPathname = pathname;
    renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(navigation).queryByRole("link", { name: "모임 관리" })).not.toBeInTheDocument();
    expect(
      within(navigation)
        .queryAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
    ).toHaveLength(0);
  }
);

it("provides skip navigation, global navigation, and a main landmark", () => {
  // Given
  const auth = { login: jest.fn(), logout: jest.fn(), status: "anonymous" };

  // When
  renderShell(auth);

  // Then
  expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toHaveAttribute(
    "href",
    "#main-content"
  );
  const brand = screen.getByRole("link", { name: "자리하나 홈" });
  const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  expect(brand).toHaveAttribute("href", "/groups");
  expect(brand).toHaveTextContent("자리 하나?");
  expect(
    within(navigation)
      .getAllByRole("link")
      .map((link) => link.textContent)
  ).toEqual(["탐색", "모임 만들기"]);
  expect(screen.getByRole("link", { name: "모임 만들기" })).toHaveAttribute("href", "/groups/new");
  expect(screen.queryByRole("link", { name: "마이페이지" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "모임 관리" })).not.toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
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
    const navigationContinues = fireEvent.click(screen.getByRole("link", { name: label }));

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
    within(screen.getByRole("navigation", { name: "주요 메뉴" }))
      .getAllByRole("link")
      .map((link) => link.textContent)
  ).toEqual(["탐색", "모임 만들기"]);
  expect(screen.getByRole("link", { name: "모임 만들기" })).toHaveAttribute("href", "/groups/new");
  expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/my");
  expect(logout).toHaveBeenCalledTimes(1);
});

it("opens and closes the mobile navigation drawer", () => {
  // Given
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });
  const menuButton = screen.getByRole("button", { name: "메뉴 열기" });

  // When
  fireEvent.click(menuButton);

  // Then
  expect(menuButton).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("dialog", { name: "전체 메뉴" })).toBeInTheDocument();

  // When
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));

  // Then
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
});
