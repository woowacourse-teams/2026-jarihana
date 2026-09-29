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

it("starts GitHub login from the anonymous header action", () => {
  // Given
  const login = jest.fn();
  renderShell({ login, logout: jest.fn(), status: "anonymous" });

  // When
  fireEvent.click(screen.getByRole("button", { name: "GitHub로 로그인" }));

  // Then
  expect(login).toHaveBeenCalledTimes(1);
});

it.each(["header", "mobile menu", "footer"])(
  "shows the login-required dialog from the feedback %s without redirecting",
  (surface) => {
    // Given
    const login = jest.fn();
    renderShell({ login, logout: jest.fn(), status: "anonymous" });

    // When
    let feedbackButton;
    if (surface === "mobile menu") {
      fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
      feedbackButton = within(screen.getByRole("navigation", { name: "모바일 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else if (surface === "footer") {
      feedbackButton = within(screen.getByRole("region", { name: "Contact us" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else {
      feedbackButton = within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    }
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

it.each(["header", "mobile menu", "footer"])(
  "stores a feedback return target and starts login from the %s prompt",
  (surface) => {
    // Given
    const login = jest.fn();
    mockSearch = "?tab=mine";
    mockHash = "#recent";
    renderShell({ login, logout: jest.fn(), status: "anonymous" });

    // When
    let feedbackButton;
    if (surface === "mobile menu") {
      fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
      feedbackButton = within(screen.getByRole("navigation", { name: "모바일 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else if (surface === "footer") {
      feedbackButton = within(screen.getByRole("region", { name: "Contact us" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else {
      feedbackButton = within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    }
    fireEvent.click(feedbackButton);
    fireEvent.click(screen.getByRole("button", { name: "로그인하러 가기" }));

    // Then
    expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe(
      "/groups?tab=mine&feedback=open#recent"
    );
    expect(login).toHaveBeenCalledTimes(1);
  }
);

it.each(["header", "mobile menu", "footer"])(
  "opens the feedback form directly for authenticated users from the %s",
  (surface) => {
    // Given
    renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

    // When
    let feedbackButton;
    if (surface === "mobile menu") {
      fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
      feedbackButton = within(screen.getByRole("navigation", { name: "모바일 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else if (surface === "footer") {
      feedbackButton = within(screen.getByRole("region", { name: "Contact us" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else {
      feedbackButton = within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    }
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

it.each(["header", "mobile menu", "footer"])(
  "does not start feedback login while authentication loads from the %s",
  (surface) => {
    // Given
    const login = jest.fn();
    renderShell({ login, logout: jest.fn(), status: "loading" });

    // When
    let feedbackButton;
    if (surface === "mobile menu") {
      fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
      feedbackButton = within(screen.getByRole("navigation", { name: "모바일 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else if (surface === "footer") {
      feedbackButton = within(screen.getByRole("region", { name: "Contact us" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    } else {
      feedbackButton = within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole(
        "button",
        { name: "피드백 남기기" }
      );
    }
    fireEvent.click(feedbackButton);

    // Then
    expect(feedbackButton).toBeDisabled();
    expect(login).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "피드백 남기기" })).not.toBeInTheDocument();
  }
);

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
    within(screen.getByRole("navigation", { name: "주요 메뉴" }))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
  ).toEqual(["/groups", "/activities"]);
  expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/my");
  expect(logout).toHaveBeenCalledTimes(1);
});

it("places feedback after discovery links in desktop and mobile navigation", () => {
  // Given
  renderShell({ login: jest.fn(), logout: jest.fn(), status: "authenticated" });

  // Then
  const expectedOrder = ["탐색", "활동 기록", "피드백 남기기"];
  const desktopNavigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  expect(
    Array.from(desktopNavigation.querySelectorAll("a, button")).map((item) =>
      item.textContent.trim()
    )
  ).toEqual(expectedOrder);

  // And
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  const mobileNavigation = screen.getByRole("navigation", { name: "모바일 메뉴" });
  const expectedMobileOrder = ["탐색", "활동 기록", "모임 만들기", "피드백 남기기"];
  expect(
    Array.from(mobileNavigation.querySelectorAll("a, button"))
      .slice(0, 4)
      .map((item) => item.textContent.trim())
  ).toEqual(expectedMobileOrder);
});
