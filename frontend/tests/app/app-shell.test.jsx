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

it("opens the account actions and logs out an authenticated member", () => {
  const logout = jest.fn();
  renderShell({ login: jest.fn(), logout, member: { crewName: "자리" }, status: "authenticated" });
  expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button", { name: "자리 계정 메뉴" })[0]);
  const menu = screen.getByRole("navigation", { name: "계정 메뉴" });
  expect(within(menu).getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/my");
  fireEvent.click(within(menu).getByRole("button", { name: "로그아웃" }));

  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("navigation", { name: "계정 메뉴" })).not.toBeInTheDocument();
});

it("shows the signed-in photo and nickname on desktop and mobile account buttons", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/123";
  renderShell({ avatarUrl, member: { crewName: "에덴" }, status: "authenticated" });

  for (const profile of screen.getAllByRole("button", { name: "에덴 계정 메뉴" })) {
    expect(profile.querySelector("img")).toHaveAttribute("src", avatarUrl);
    expect(profile).toHaveTextContent("에덴");
    expect(profile).toHaveAttribute("aria-expanded", "false");
    expect(profile).toHaveAttribute("data-ph-capture-attribute-action", "profile_menu_toggle");
  }
  expect(screen.queryByRole("button", { name: "GitHub로 로그인" })).not.toBeInTheDocument();
});

it("uses the member avatar and keeps the nickname when the photo fails", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/456";
  renderShell({ member: { avatarUrl, crewName: "자리" }, status: "authenticated" });

  for (const profile of screen.getAllByRole("button", { name: "자리 계정 메뉴" })) {
    const image = profile.querySelector("img");
    expect(image).toHaveAttribute("src", avatarUrl);
    fireEvent.error(image);
    expect(profile.querySelector("img")).toBeNull();
    expect(profile).toHaveTextContent("자자리");
  }
});

it("opens on hover, keeps the pointer path to the menu open, and closes on leave", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  const trigger = screen.getAllByRole("button", { name: "자리 계정 메뉴" })[0];
  const container = trigger.parentElement;
  const enter = new Event("pointerover", { bubbles: true });
  Object.defineProperty(enter, "pointerType", { value: "mouse" });
  fireEvent(container, enter);

  const menu = screen.getByRole("navigation", { name: "계정 메뉴" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(trigger).toHaveAttribute("aria-controls", menu.id);
  fireEvent(trigger, new MouseEvent("pointerout", { bubbles: true, relatedTarget: menu }));
  expect(menu).toBeInTheDocument();
  fireEvent(container, new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
  expect(screen.queryByRole("navigation", { name: "계정 메뉴" })).not.toBeInTheDocument();
});

it("dismisses on Escape, outside press, and focus leaving the account actions", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  const trigger = screen.getAllByRole("button", { name: "자리 계정 메뉴" })[0];
  fireEvent.click(trigger);
  screen.getByRole("link", { name: "마이페이지" }).focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: screen.getByRole("button", { name: "메뉴 열기" }) });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("supports tapping the mobile account button and closes when selecting my page", () => {
  mockPathname = "/my/groups";
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  const trigger = screen.getAllByRole("button", { name: "자리 계정 메뉴" })[1];
  expect(trigger.querySelector("img")).toBeNull();
  fireEvent.click(trigger);
  const profile = screen.getByRole("link", { name: "마이페이지" });
  expect(profile).toHaveAttribute("aria-current", "page");
  expect(profile).toHaveAttribute("data-ph-capture-attribute-action", "my_page_view");
  fireEvent.click(profile);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("closes the mobile drawer when selecting my page", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const menu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  fireEvent.click(within(menu).getByRole("link", { name: "마이페이지" }));
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
});
