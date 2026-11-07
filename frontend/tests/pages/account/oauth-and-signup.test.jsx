import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router";

import { consumeReturnTarget, useAuth } from "../../../src/features/auth/index.js";
import { useSignupMember } from "../../../src/features/member/index.js";
import { OAuthCallbackPage, SignupPage } from "../../../src/pages/account/index.js";
import {
  beginLoginAttempt,
  consumeLoginCompletion
} from "../../../src/shared/analytics/loginConversion.js";

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
  sessionStorage.clear();
});

describe("OAuthCallbackPage", () => {
  it("Given StrictMode and a signup session, When verification completes, Then it enters signup after one reload", async () => {
    // Given
    let status = "loading";
    let resolveReload;
    const reload = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveReload = resolve;
        })
    );
    const navigate = jest.fn();
    useNavigate.mockReturnValue(navigate);
    useAuth.mockImplementation(() => ({
      status,
      member: null,
      login: jest.fn(),
      logout: jest.fn(),
      reload
    }));

    // When
    renderRoute(
      "/oauth/callback?signupRequired=true",
      <StrictMode>
        <OAuthCallbackPage />
      </StrictMode>
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    status = "signup-required";
    resolveReload();

    // Then
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signup", { replace: true }));
  });

  it("Given a misleading signup query and an authenticated session, When the callback reloads auth, Then it enters My instead of trusting the query", async () => {
    // Given
    beginLoginAttempt();
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
    expect(consumeLoginCompletion(11)).toBe(true);
    expect(consumeLoginCompletion(11)).toBe(false);
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
    useNavigate.mockReturnValue(jest.fn());
    useAuth.mockReturnValue({
      status: "signup-required",
      member: null,
      login: jest.fn(),
      logout: jest.fn(),
      reload: jest.fn().mockResolvedValue(undefined)
    });
  });

  async function submitAndConfirm(user) {
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));
    await user.click(screen.getByRole("button", { name: "확인" }));
  }

  it("Given the signup screen, When it renders, Then it asks only for a nickname without member type choices", () => {
    // When
    renderRoute("/signup", <SignupPage />);

    // Then
    expect(screen.getByRole("heading", { name: "프로필 입력" })).toHaveClass("account-heading__title");
    expect(screen.getByRole("heading", { name: "자리하나에서 쓸 닉네임을 알려주세요" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "닉네임" })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "signup_name_input"
    );
    expect(screen.getByRole("textbox", { name: "닉네임" })).toHaveAccessibleDescription(
      expect.stringMatching(/우아한테크코스 크루는 GitHub 계정으로 기수와 과정을 자동으로 확인해요/)
    );
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이전" })).not.toBeInTheDocument();
  });

  it("Given a valid nickname, When signup is confirmed, Then it submits only the nickname and uses the saved return target", async () => {
    // Given
    const mutateAsync = jest.fn().mockResolvedValue({ id: 12, crewName: "도담", memberType: "MEMBER" });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    // When
    await user.type(screen.getByRole("textbox", { name: "닉네임" }), " 도담 ");
    await submitAndConfirm(user);

    // Then
    expect(mutateAsync).toHaveBeenCalledWith({ crewName: "도담" });
    expect(consumeReturnTarget).toHaveBeenCalledWith("/my");
  });

  it("Given an invalid nickname, When submitted, Then the field explains the rule without opening confirmation", async () => {
    // Given
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    // When
    await user.type(screen.getByRole("textbox", { name: "닉네임" }), "a자");
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));

    // Then
    expect(await screen.findByRole("textbox", { name: "닉네임" })).toHaveAccessibleDescription(
      expect.stringMatching(/닉네임은 한글 2~4자로 입력해 주세요/)
    );
    expect(screen.queryByRole("button", { name: "확인" })).not.toBeInTheDocument();
    expect(useSignupMember().mutateAsync).not.toHaveBeenCalled();
  });

  it("Given the confirmation dialog, When it is canceled, Then nothing is submitted and the nickname stays", async () => {
    // Given
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);
    await user.type(screen.getByRole("textbox", { name: "닉네임" }), "도담");
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));

    // When
    await user.click(screen.getByRole("button", { name: "취소" }));

    // Then
    expect(screen.queryByRole("button", { name: "확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "닉네임" })).toHaveValue("도담");
    expect(useSignupMember().mutateAsync).not.toHaveBeenCalled();
  });

  it("Given a duplicate nickname conflict, When signup fails, Then a safe recovery message is announced", async () => {
    // Given
    const mutateAsync = jest
      .fn()
      .mockRejectedValue({ status: 409, userMessage: "이미 사용 중인 크루명입니다." });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    // When
    await user.type(screen.getByRole("textbox", { name: "닉네임" }), "자리");
    await submitAndConfirm(user);

    // Then
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 크루명입니다.");
    expect(consumeReturnTarget).not.toHaveBeenCalled();
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
