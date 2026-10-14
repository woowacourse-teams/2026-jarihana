import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { useAuth } from "../../../src/features/auth";
import { LandingPage } from "../../../src/pages/landing/LandingPage";

jest.mock("react-router", () => ({
  MemoryRouter: ({ children }) => children,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>
}));

jest.mock("../../../src/features/auth", () => ({
  storeReturnTarget: jest.requireActual("../../../src/features/auth/returnTarget")
    .storeReturnTarget,
  useAuth: jest.fn()
}));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

test("keeps authentication actions disabled while checking the current session", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "loading", login });
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );

  const buttons = screen.getAllByRole("button", { name: "연결 중" });
  expect(buttons).toHaveLength(3);
  for (const button of buttons) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(login).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "둘러보기", exact: true })).toHaveAttribute(
    "href",
    "/groups"
  );
});

test("reports a failed login connection and retains the creation destination for retry", () => {
  const login = jest.fn(() => {
    throw new Error("OAuth configuration unavailable");
  });
  useAuth.mockReturnValue({ status: "unavailable", login });
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole("button", { name: "모임 만들기", exact: true }));
  expect(screen.getByRole("alert")).toHaveTextContent("로그인을 연결하지 못했어요");
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/groups/new");
  expect(screen.getByRole("button", { name: "모임 만들기", exact: true })).toBeEnabled();
});


test("lets signed-in visitors view the landing and continue without another login", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "authenticated", login });
  render(<LandingPage />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("함께하고 싶은 순간,여기, 자리하나.");
  const homeLinks = screen.getAllByRole("link", { name: "홈으로 가기" });
  expect(homeLinks).toHaveLength(2);
  for (const link of homeLinks) {
    expect(link).toHaveAttribute("href", "/home");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "group_home");
  }
  const create = screen.getByRole("link", { name: "모임 만들기", exact: true });
  expect(create).toHaveAttribute("href", "/groups/new");
  expect(create).toHaveAttribute("data-ph-capture-attribute-action", "group_create");
  expect(login).not.toHaveBeenCalled();
});

test("returns a new login to home while keeping a creation signup destination", () => {
  const login = jest.fn();
  useAuth.mockReturnValue({ status: "anonymous", login });
  const { rerender } = render(<LandingPage />);
  fireEvent.click(screen.getByRole("button", { name: "시작하기", exact: true }));
  expect(login).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/home");

  useAuth.mockReturnValue({ status: "signup-required", login });
  rerender(<LandingPage />);
  const signupLinks = screen.getAllByRole("link", { name: "가입 계속하기" });
  expect(signupLinks).toHaveLength(3);
  fireEvent.click(signupLinks[1]);
  expect(signupLinks[1]).toHaveAttribute("href", "/signup");
  expect(sessionStorage.getItem("jarihana:auth:return-target")).toBe("/groups/new");
  expect(login).toHaveBeenCalledTimes(1);
});
