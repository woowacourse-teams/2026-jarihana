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
    Avatar: jest.requireActual("../../src/shared/ui/Cards.jsx").Avatar,
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
  "stores %s as the login return target and starts GitHub login",
  (label, target) => {
    // Given
    const login = jest.fn();
    renderShell({ login, logout: jest.fn(), status: "anonymous" });

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
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("로그인이 필요한 메뉴예요")).not.toBeInTheDocument();
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
  for (const profile of screen.getAllByRole("link", { name: "마이페이지" })) {
    expect(profile).toHaveAttribute("href", "/my");
  }
  expect(logout).toHaveBeenCalledTimes(1);
});

it("shows the signed-in profile image on desktop and mobile header links", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/123";
  renderShell({ avatarUrl, member: { crewName: "자리" }, status: "authenticated" });

  for (const profile of screen.getAllByRole("link", { name: "마이페이지" })) {
    expect(profile.querySelector("img")).toHaveAttribute("src", avatarUrl);
    expect(profile).toHaveAttribute("data-ph-capture-attribute-action", "my_page_view");
  }
  expect(screen.queryByRole("button", { name: "GitHub로 로그인" })).not.toBeInTheDocument();
});

it("uses the member avatar and falls back to their initial if the image fails", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/456";
  renderShell({ member: { avatarUrl, crewName: "자리" }, status: "authenticated" });

  for (const profile of screen.getAllByRole("link", { name: "마이페이지" })) {
    const image = profile.querySelector("img");
    expect(image).toHaveAttribute("src", avatarUrl);
    fireEvent.error(image);
    expect(profile.querySelector("img")).toBeNull();
    expect(profile).toHaveTextContent("자");
    expect(profile).toHaveAttribute("href", "/my");
  }
});

it("keeps a usable profile link without an avatar and closes the mobile drawer on navigation", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  mockPathname = "/my/groups";
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const menu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  const profile = within(menu).getByRole("link", { name: "마이페이지" });

  expect(profile.querySelector("img")).toBeNull();
  expect(profile).toHaveTextContent("자");
  expect(profile).toHaveAttribute("aria-current", "page");
  fireEvent.click(profile);
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
});
