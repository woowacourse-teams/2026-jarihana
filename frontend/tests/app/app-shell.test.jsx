import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "../../src/app/AppShell";
import { useAuth } from "../../src/features/auth";
import { ToastProvider } from "../../src/shared/ui/Toast.jsx";

let mockPathname = "/groups";
let mockSearch = "";
let mockHash = "";
let mockNavigate;

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
  useLocation: () => ({ hash: mockHash, pathname: mockPathname, search: mockSearch }),
  useNavigate: () => mockNavigate
}));

jest.mock("../../src/features/auth", () => ({
  storeReturnTarget: jest.requireActual("../../src/features/auth/returnTarget").storeReturnTarget,
  useAuth: jest.fn()
}));

jest.mock("../../src/features/feedback", () => ({
  ...jest.requireActual("../../src/features/feedback"),
  FeedbackForm: () => <div>피드백 폼</div>
}));

jest.mock("../../src/shared/ui", () => {
  const { Button } = jest.requireActual("../../src/shared/ui/Button.jsx");
  const { Modal } = jest.requireActual("../../src/shared/ui/Overlay.jsx");
  const { useToast } = jest.requireActual("../../src/shared/ui/Toast.jsx");
  return {
    Avatar: jest.requireActual("../../src/shared/ui/Cards.jsx").Avatar,
    Button,
    Drawer: ({ children, onClose, open, title }) =>
      open ? (
        <div aria-label={title} role="dialog">
          <button onClick={onClose} type="button">
            닫기
          </button>
          {children}
        </div>
      ) : null,
    Modal,
    useToast
  };
});

function renderShell(auth) {
  useAuth.mockReturnValue(auth);
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider duration={0}>
        <AppShell>
          <h1>현재 화면</h1>
        </AppShell>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockPathname = "/groups";
  mockSearch = "";
  mockHash = "";
  mockNavigate = jest.fn();
  sessionStorage.clear();
});

it("exposes the public sparring menu in the header and mobile drawer", () => {
  mockPathname = "/sparring";
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "anonymous" });

  const desktopMenu = screen.getByRole("navigation", { name: "주요 메뉴" });
  const desktopLink = within(desktopMenu).getByRole("link", { name: "토론하나?" });
  expect(desktopLink).toHaveAttribute("href", "/sparring");
  expect(desktopLink).toHaveAttribute("aria-current", "page");
  expect(desktopLink).toHaveAttribute("data-ph-capture-attribute-action", "sparring_view");

  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const mobileMenu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  expect(within(mobileMenu).getByRole("link", { name: "토론하나?" })).toHaveAttribute("href", "/sparring");
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

it.each(["desktop", "mobile"])("preserves the shared discussion before %s header login", (layout) => {
  mockPathname = "/sparring/91";
  mockSearch = "?view=compact";
  mockHash = "#discussion";
  const login = jest.fn();
  renderShell({ login, status: "anonymous" });
  if (layout === "mobile") fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const area = layout === "mobile"
    ? screen.getByRole("navigation", { name: "모바일 메뉴" })
    : screen.getByRole("banner");
  fireEvent.click(within(area).getByRole("button", { name: "GitHub로 로그인" }));
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/sparring/91?view=compact#discussion");
  expect(login).toHaveBeenCalledTimes(1);
});

it("returns to group creation after login from the desktop create action", () => {
  const login = jest.fn();
  renderShell({ login, status: "anonymous" });
  const createLink = within(screen.getByRole("banner")).getByRole("link", { name: "자리 만들기" });

  expect(createLink).toHaveAttribute("href", "/groups/new");
  expect(createLink).toHaveAttribute("data-ph-capture-attribute-action", "group_create");
  expect(fireEvent.click(createLink)).toBe(false);
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/groups/new");
  expect(login).toHaveBeenCalledTimes(1);
});

it("starts GitHub login from the mobile account area and closes the drawer", () => {
  const login = jest.fn();
  renderShell({ login, status: "anonymous" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const menu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  const loginButton = within(menu).getByRole("button", { name: "GitHub로 로그인" });
  expect(within(menu).getByText("게스트")).toBeInTheDocument();
  expect(within(menu).queryByText("나의 프로필")).not.toBeInTheDocument();
  expect(within(menu).getByRole("heading", { name: "메뉴" })).toBeInTheDocument();
  expect(loginButton).toHaveAttribute("data-ph-capture-attribute-action", "login");
  expect(within(menu).queryByRole("link", { name: "마이페이지" })).not.toBeInTheDocument();
  fireEvent.click(loginButton);
  expect(login).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
});

it(
  "shows the login-required dialog from the feedback floating button without redirecting",
  () => {
    // Given
    const login = jest.fn();
    renderShell({ login, logout: jest.fn(), status: "anonymous" });

    // When
    const feedbackButton = screen.getByRole("button", { name: "피드백 남기기" });
    fireEvent.click(feedbackButton);

    // Then
    expect(login).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "로그인이 필요한 서비스예요" })
    ).toBeInTheDocument();
    expect(screen.getByText("피드백을 남기려면 로그인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인하러 가기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "피드백 남기기" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem("jarihana:auth:return-target")).toBeNull();
  }
);

it(
  "stores a feedback return target and starts login from the floating button prompt",
  () => {
    // Given
    const login = jest.fn();
    mockSearch = "?tab=mine";
    mockHash = "#recent";
    renderShell({ login, logout: jest.fn(), status: "anonymous" });

    // When
    const feedbackButton = screen.getByRole("button", { name: "피드백 남기기" });
    fireEvent.click(feedbackButton);
    fireEvent.click(screen.getByRole("button", { name: "로그인하러 가기" }));

    // Then
    expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe(
      "/groups?tab=mine&feedback=open#recent"
    );
    expect(login).toHaveBeenCalledTimes(1);
  }
);

it(
  "opens the feedback form directly for authenticated users from the floating button",
  () => {
    // Given
    renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

    // When
    const feedbackButton = screen.getByRole("button", { name: "피드백 남기기" });
    fireEvent.click(feedbackButton);

    // Then
    expect(screen.getByRole("dialog", { name: "피드백 남기기" })).toBeInTheDocument();
    expect(screen.getByText("피드백 폼")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "로그인이 필요한 서비스예요" })
    ).not.toBeInTheDocument();
  }
);

it("opens the feedback form after login returns and clears the marker when dismissed", () => {
  // Given
  mockSearch = "?tab=mine&feedback=open";
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

  // Then
  const feedbackDialog = screen.getByRole("dialog", { name: "피드백 남기기" });
  expect(feedbackDialog).toBeInTheDocument();
  fireEvent.click(within(feedbackDialog).getByRole("button", { name: "닫기" }));
  expect(mockNavigate).toHaveBeenCalledWith(
    { hash: "", pathname: "/groups", search: "?tab=mine" },
    { replace: true }
  );
});

it(
  "does not start feedback login while authentication loads from the floating button",
  () => {
    // Given
    const login = jest.fn();
    renderShell({ login, logout: jest.fn(), status: "loading" });

    // When
    const feedbackButton = screen.getByRole("button", { name: "피드백 남기기" });
    fireEvent.click(feedbackButton);

    // Then
    expect(feedbackButton).toBeDisabled();
    expect(login).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "피드백 남기기" })).not.toBeInTheDocument();
  }
);

it.each([["자리 만들기", "/groups/new"]])(
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

it.each(["/sparring/91", "/signup"])("keeps the discussion return target when continuing signup from %s", (pathname) => {
  mockPathname = pathname;
  sessionStorage.setItem("jarihana:auth:return-target", "/sparring/91");
  renderShell({ status: "signup-required" });
  fireEvent.click(screen.getByRole("link", { name: "가입 계속하기" }));
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/sparring/91");
});

it("reveals logout only after opening the profile menu", () => {
  const logout = jest.fn();
  renderShell({ login: jest.fn(), logout, member: { crewName: "자리" }, status: "authenticated" });

  expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "프로필 메뉴" })[0]);
  const logoutButton = screen.getByRole("button", { name: "로그아웃" });
  expect(logoutButton).toHaveAttribute("data-ph-capture-attribute-action", "logout");
  fireEvent.click(logoutButton);

  // Then
  expect(
    within(screen.getByRole("navigation", { name: "주요 메뉴" }))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
  ).toEqual(["/sparring", "/games"]);
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("navigation", { name: "계정 메뉴" })).not.toBeInTheDocument();
});

it("keeps the profile dropdown only in the desktop header", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/123";
  renderShell({ avatarUrl, member: { crewName: "에덴" }, status: "authenticated" });

  expect(screen.getAllByRole("button", { name: "프로필 메뉴" })).toHaveLength(1);
  for (const profile of screen.getAllByRole("button", { name: "프로필 메뉴" })) {
    expect(profile.querySelector("img")).toHaveAttribute("src", avatarUrl);
    expect(profile).toHaveAttribute("data-ph-capture-attribute-action", "profile_menu_toggle");
    expect(profile).not.toHaveTextContent("에덴");
    expect(profile).toHaveAttribute("aria-expanded", "false");
  }
  expect(screen.queryByRole("navigation", { name: "계정 메뉴" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "GitHub로 로그인" })).not.toBeInTheDocument();
});

it("uses the member avatar and falls back to the first nickname letter when the photo fails", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/456";
  renderShell({ member: { avatarUrl, crewName: "자리" }, status: "authenticated" });

  for (const profile of screen.getAllByRole("button", { name: "프로필 메뉴" })) {
    const image = profile.querySelector("img");
    expect(image).toHaveAttribute("src", avatarUrl);
    fireEvent.error(image);
    expect(profile.querySelector("img")).toBeNull();
    expect(profile).toHaveTextContent(/^자$/);
  }
});

it("marks my page as current and closes the profile menu after selection", () => {
  mockPathname = "/my/groups";
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });

  const trigger = screen.getByRole("button", { name: "프로필 메뉴" });
  fireEvent.click(trigger);
  const profile = screen.getByRole("link", { name: "마이페이지" });
  expect(profile).toHaveAttribute("aria-current", "page");
  expect(profile).toHaveAttribute("href", "/my");
  expect(profile).toHaveAttribute("data-ph-capture-attribute-action", "my_page_view");
  fireEvent.click(profile);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("toggles the profile menu by click and keeps it closed on hover", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  const trigger = screen.getByRole("button", { name: "프로필 메뉴" });
  fireEvent.pointerEnter(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  const menu = screen.getByRole("navigation", { name: "계정 메뉴" });
  expect(trigger).toHaveAttribute("aria-controls", menu.id);
  fireEvent.pointerLeave(trigger);
  expect(menu).toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.queryByRole("navigation", { name: "계정 메뉴" })).not.toBeInTheDocument();
});

it("returns focus to the profile button when Escape closes the menu", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  const trigger = screen.getAllByRole("button", { name: "프로필 메뉴" })[0];
  fireEvent.click(trigger);
  screen.getByRole("link", { name: "마이페이지" }).focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("closes the profile menu after an outside press or focus leaving", () => {
  renderShell({ member: { crewName: "자리" }, status: "authenticated" });
  const trigger = screen.getAllByRole("button", { name: "프로필 메뉴" })[0];
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole("heading", { name: "현재 화면" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: screen.getByRole("button", { name: "메뉴 열기" }) });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("closes the mobile drawer when selecting my page", () => {
  const avatarUrl = "https://avatars.githubusercontent.com/u/123";
  renderShell({ avatarUrl, member: { course: "FRONTEND", crewName: "자리", generation: 8, memberType: "CREW" }, status: "authenticated" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const menu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  const profile = within(menu).getByRole("link", { name: "마이페이지" });
  expect(profile.querySelector("img")).toBeNull();
  expect(profile).toHaveClass("app-header__link");
  expect(menu.querySelector("img")).toHaveAttribute("src", avatarUrl);
  expect(within(menu).getByText("자리", { selector: "strong" })).toBeInTheDocument();
  expect(within(menu).getByText("나의 프로필")).toBeInTheDocument();
  expect(within(menu).getByText("8기 / 프론트엔드")).toBeInTheDocument();
  expect(profile).toHaveAttribute("data-ph-capture-attribute-action", "my_page_view");
  expect(within(menu).queryByRole("button", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  fireEvent.click(profile);
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
});

it.each([
  ["COACH", "코치"],
  ["BOOTCAMP", "부트캠프"],
  ["PROFESSIONAL", "현직자"],
  ["CREW", "기수 미정"]
])("shows the appropriate member label when %s has no generation", (memberType, label) => {
  renderShell({ member: { crewName: "자리", generation: null, memberType }, status: "authenticated" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const menu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  expect(within(menu).getByText(label)).toBeInTheDocument();
  expect(within(menu).queryByText("null기")).not.toBeInTheDocument();
});

it("logs out from the mobile account row and closes the drawer", () => {
  const logout = jest.fn();
  renderShell({ logout, member: { crewName: "자리" }, status: "authenticated" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const menu = screen.getByRole("navigation", { name: "모바일 메뉴" });
  const logoutButton = within(menu).getByRole("button", { name: "로그아웃" });
  expect(logoutButton).toHaveAttribute("data-ph-capture-attribute-action", "logout");
  fireEvent.click(logoutButton);
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
});

it("places feedback outside desktop and mobile navigation", () => {
  // Given
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

  // Then
  const desktopNavigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  expect(
    within(desktopNavigation).getAllByRole("link").map((item) => item.textContent.trim())
  ).toEqual(["토론하나?", "게임하나?"]);
  expect(within(desktopNavigation).getByRole("button", { name: "자리" })).toHaveAttribute("aria-expanded", "false");
  expect(desktopNavigation.style.getPropertyValue("--header-nav-item-count")).toBe("3");

  const feedbackButton = screen.getAllByRole("button", { name: "피드백 남기기" })
    .find((button) => button.classList.contains("app-feedback-button"));
  expect(feedbackButton).toHaveClass("app-feedback-button");
  expect(feedbackButton).toHaveAttribute("data-ph-capture-attribute-action", "feedback_start");
  expect(desktopNavigation).not.toContainElement(feedbackButton);
  expect(within(screen.getByRole("region", { name: "Contact us" }))
    .queryByRole("button", { name: "피드백 남기기" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "피드백 남기기" })).toHaveLength(1);

  // And
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const mobileNavigation = screen.getByRole("navigation", { name: "모바일 메뉴" });
  expect(
    within(mobileNavigation).getAllByRole("link").map((item) => item.textContent.trim())
  ).toEqual(["토론하나?", "게임하나?", "자리 만들기", "마이페이지", "채팅"]);
  expect(within(mobileNavigation).getByRole("button", { name: "자리" })).toHaveAttribute("aria-expanded", "false");
});

it.each([
  ["/home", null],
  ["/groups", "뭐있나?"],
  ["/activities", "뭐했나?"],
  ["/board", "뭐할래?"],
  ["/board/42", "뭐할래?"],
  ["/games", "게임하나?"],
  ["/games/gomoku/rooms/1", "게임하나?"],
  ["/groups/new", null],
  ["/groups/41", null]
])("exposes public navigation on %s with matching active state", (pathname, activeName) => {
  mockPathname = pathname;
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "anonymous" });
  expect(screen.getByRole("link", { name: "자리하나 홈" })).toHaveAttribute("href", "/home");
  const navigation = within(screen.getByRole("navigation", { name: "주요 메뉴" }));
  const trigger = navigation.getByRole("button", { name: "자리" });
  expect(trigger).toHaveAttribute("data-ph-capture-attribute-action", "group_navigation_toggle");
  fireEvent.click(trigger);
  for (const [name, href, action] of [
    ["뭐있나?", "/groups", "group_browse"],
    ["뭐했나?", "/activities", "browse_activity_posts"],
    ["뭐할래?", "/board", "browse_proposals"],
    ["토론하나?", "/sparring", "sparring_view"],
    ["게임하나?", "/games", "games_open"]
  ]) {
    const link = navigation.getByRole("link", { name, exact: true });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", action);
    if (name === activeName) expect(link).toHaveAttribute("aria-current", "page");
    else expect(link).not.toHaveAttribute("aria-current");
  }
});

it.each([
  ["뭐있나?", "/groups"],
  ["뭐했나?", "/activities"],
  ["뭐할래?", "/board"]
])("closes the mobile menu and opens %s without requiring login", (name, href) => {
  const login = jest.fn();
  renderShell({ login, logout: jest.fn(), status: "anonymous" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const navigation = within(screen.getByRole("navigation", { name: "모바일 메뉴" }));
  fireEvent.click(navigation.getByRole("button", { name: "자리" }));
  const link = navigation.getByRole("link", {
    name,
    exact: true
  });
  expect(link).toHaveAttribute("href", href);
  const navigationContinues = fireEvent.click(link);
  expect(navigationContinues).toBe(true);
  expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).not.toBeInTheDocument();
  expect(login).not.toHaveBeenCalled();
});

it("describes the three 자리 destinations and dismisses the disclosure without navigating", () => {
  renderShell({ status: "anonymous" });
  const navigation = within(screen.getByRole("navigation", { name: "주요 메뉴" }));
  const trigger = navigation.getByRole("button", { name: "자리" });
  expect(navigation.queryByRole("link", { name: "뭐있나?" })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  for (const [label, description] of [
    ["뭐있나?", "함께할 자리 둘러보기"],
    ["뭐했나?", "사진으로 보는 자리 이야기"],
    ["뭐할래?", "하고 싶은 자리 제안하기"]
  ]) expect(navigation.getByRole("link", { name: label })).toHaveAccessibleDescription(description);
  navigation.getByRole("link", { name: "뭐했나?" }).focus();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole("heading", { name: "현재 화면" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: navigation.getByRole("link", { name: "게임하나?" }) });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("closes only the 자리 disclosure on Escape inside the mobile drawer", () => {
  renderShell({ status: "anonymous" });
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const navigation = within(screen.getByRole("navigation", { name: "모바일 메뉴" }));
  const trigger = navigation.getByRole("button", { name: "자리" });
  fireEvent.click(trigger);
  navigation.getByRole("link", { name: "뭐있나?" }).focus();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("dialog", { name: "전체 메뉴" })).toBeInTheDocument();
});


it.each([
  ["/", "authenticated"], ["/", "anonymous"], ["/", "loading"], ["/", "signup-required"], ["/", "unavailable"],
  ["/land", "anonymous"], ["/land", "authenticated"], ["/land", "loading"],
  ["/land/", "authenticated"]
])("leaves %s (%s) to the landing's own shell", (pathname, status) => {
  mockPathname = pathname;
  renderShell({ status });
  expect(screen.getByRole("heading", { name: "현재 화면" })).toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  expect(screen.queryByRole("main")).not.toBeInTheDocument();
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
});

it.each(["anonymous", "authenticated"])("keeps the original shell on the public home for %s", (status) => {
  mockPathname = "/home";
  renderShell({ status, member: { crewName: "자리" } });
  expect(screen.getByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("main")).toBeInTheDocument();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});
