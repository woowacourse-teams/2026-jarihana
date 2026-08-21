import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router";

import { consumeReturnTarget, useAuth } from "../../../src/features/auth/index.js";
import { useSignupMember } from "../../../src/features/member/index.js";
import { OAuthCallbackPage, SignupPage } from "../../../src/pages/account/index.js";

jest.mock("react-router", () => ({
  MemoryRouter: ({ children }) => children,
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: jest.fn()
}));
jest.mock(
  "../../../src/features/auth/index.js",
  () => ({
    consumeReturnTarget: jest.fn(),
    useAuth: jest.fn()
  }),
  { virtual: true }
);
jest.mock("../../../src/features/member/index.js", () => ({
  ...jest.requireActual("../../../src/features/member/index.js"),
  useSignupMember: jest.fn()
}));

function renderRoute(initialEntry, element) {
  window.history.replaceState({}, "", initialEntry);
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("OAuthCallbackPage", () => {
  it("Given a misleading signup query and an authenticated session, When the callback reloads auth, Then it enters My instead of trusting the query", async () => {
    // Given
    const reload = jest.fn().mockResolvedValue(undefined);
    const navigate = jest.fn();
    consumeReturnTarget.mockReturnValue("/groups/31");
    useNavigate.mockReturnValue(navigate);
    useAuth.mockReturnValue({
      status: "authenticated",
      member: {
        id: 11,
        crewName: "자리",
        generation: 3,
        course: "FRONTEND",
        avatarUrl: "https://avatars.githubusercontent.com/u/11"
      },
      login: jest.fn(),
      logout: jest.fn(),
      reload
    });

    // When
    renderRoute("/oauth/callback?signupRequired=true", <OAuthCallbackPage />);

    // Then
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/groups/31", { replace: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(consumeReturnTarget).toHaveBeenCalledWith("/my");
  });

  it("Given the callback cannot verify a session, When recovery is shown, Then login is available", async () => {
    // Given
    const login = jest.fn();
    useNavigate.mockReturnValue(jest.fn());
    useAuth.mockReturnValue({
      status: "anonymous",
      member: null,
      login,
      logout: jest.fn(),
      reload: jest.fn().mockResolvedValue(undefined)
    });
    const user = userEvent.setup();
    useNavigate.mockReturnValue(jest.fn());

    // When
    renderRoute("/oauth/callback", <OAuthCallbackPage />);
    await user.click(await screen.findByRole("button", { name: "다시 로그인" }));

    // Then
    expect(login).toHaveBeenCalledTimes(1);
    expect(consumeReturnTarget).not.toHaveBeenCalled();
  });
});

describe("SignupPage", () => {
  beforeEach(() => {
    consumeReturnTarget.mockReturnValue("/my");
    useSignupMember.mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    useAuth.mockReturnValue({
      status: "signup-required",
      member: null,
      login: jest.fn(),
      logout: jest.fn(),
      reload: jest.fn().mockResolvedValue(undefined)
    });
  });

  it("Given invalid profile fields, When submitted, Then every invalid field is identified inline", async () => {
    // Given
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    expect(
      screen.getByRole("heading", { name: "자리하나에서 사용할 정보를 알려 주세요" })
    ).toHaveClass("account-heading__title");

    // When
    await user.type(screen.getByRole("textbox", { name: "크루 이름" }), "a자");
    await user.clear(screen.getByRole("spinbutton", { name: "기수" }));
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));

    // Then
    expect(await screen.findByRole("textbox", { name: "크루 이름" })).toHaveAccessibleDescription(
      expect.stringMatching(/크루 이름은 한글 2~4자/)
    );
    expect(screen.getByRole("spinbutton", { name: "기수" })).toHaveAccessibleDescription(
      expect.stringMatching(/기수는 1 이상의 숫자/)
    );
    expect(useSignupMember().mutateAsync).not.toHaveBeenCalled();
  });

  it("Given valid fields, When signup succeeds, Then auth reloads and the signup guard solely owns continuation", async () => {
    // Given
    const reload = jest.fn().mockResolvedValue(undefined);
    const navigate = jest.fn();
    useNavigate.mockReturnValue(navigate);
    useAuth.mockReturnValue({
      status: "signup-required",
      member: null,
      login: jest.fn(),
      logout: jest.fn(),
      reload
    });
    const mutateAsync = jest.fn().mockResolvedValue({
      id: 11,
      crewName: "자리",
      generation: 3,
      course: "FRONTEND",
      joinedAt: "2026-08-21T10:30:00"
    });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    // When
    await user.type(screen.getByRole("textbox", { name: "크루 이름" }), "자리");
    await user.clear(screen.getByRole("spinbutton", { name: "기수" }));
    await user.type(screen.getByRole("spinbutton", { name: "기수" }), "3");
    await user.selectOptions(screen.getByRole("combobox", { name: "과정" }), "FRONTEND");
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));

    // Then
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      crewName: "자리",
      generation: 3,
      course: "FRONTEND"
    });
    expect(consumeReturnTarget).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Given a duplicate member conflict, When signup fails, Then a safe recovery message is announced", async () => {
    // Given
    const mutateAsync = jest
      .fn()
      .mockRejectedValue({ status: 409, userMessage: "이미 사용 중인 크루 정보예요." });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    useNavigate.mockReturnValue(jest.fn());
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    // When
    await user.type(screen.getByRole("textbox", { name: "크루 이름" }), "자리");
    await user.clear(screen.getByRole("spinbutton", { name: "기수" }));
    await user.type(screen.getByRole("spinbutton", { name: "기수" }), "3");
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));

    // Then
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 크루 정보예요.");
  });

  it("Given no signup session, When signup renders, Then it offers safe login recovery without posting member data", async () => {
    // Given
    const login = jest.fn();
    const mutateAsync = jest.fn();
    useAuth.mockReturnValue({
      status: "anonymous",
      member: null,
      login,
      logout: jest.fn(),
      reload: jest.fn()
    });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    useNavigate.mockReturnValue(jest.fn());
    const user = userEvent.setup();

    // When
    renderRoute("/signup", <SignupPage />);
    await user.click(screen.getByRole("button", { name: "GitHub로 다시 로그인" }));

    // Then
    expect(login).toHaveBeenCalledTimes(1);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(consumeReturnTarget).not.toHaveBeenCalled();
  });
});
