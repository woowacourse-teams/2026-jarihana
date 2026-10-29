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

  async function startBootcamp(user) {
    renderRoute("/signup", <SignupPage />);
    await user.click(screen.getByRole("radio", { name: /부트캠프/ }));
  }

  async function startCrew(user) {
    await startBootcamp(user);
    await user.click(screen.getByRole("radio", { name: "우아한테크코스" }));
    await user.click(screen.getByRole("button", { name: "우테코 크루 인증" }));
  }

  async function submitAndConfirm(user) {
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));
    await user.click(screen.getByRole("button", { name: "확인" }));
  }

  it("Given the first screen, When it renders, Then it offers bootcamp and company without crew or coach cards", () => {
    // When
    renderRoute("/signup", <SignupPage />);

    // Then
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /부트캠프/ })).toHaveAttribute(
      "data-ph-capture-attribute-action",
      "signup_member_type_select"
    );
    expect(screen.getByRole("radio", { name: /회사/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /코치/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^크루$/ })).not.toBeInTheDocument();
  });

  it("Given the bootcamp path, When every question is answered, Then it submits the bootcamp profile", async () => {
    // Given
    const mutateAsync = jest.fn().mockResolvedValue({ id: 12 });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    await startBootcamp(user);

    // When
    expect(screen.getByRole("heading", { name: "어느 부트캠프인가요?" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "SSAFY" }));
    await user.type(screen.getByRole("textbox", { name: /기수/ }), "12기");
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(screen.getByRole("radio", { name: /수강 중/ }));
    await user.click(screen.getByRole("radio", { name: "백엔드" }));
    expect(screen.getByRole("list", { name: "지금까지 고른 답" })).toHaveTextContent("SSAFY 12기");
    await user.type(screen.getByRole("textbox", { name: "닉네임" }), "도담");
    await submitAndConfirm(user);

    // Then
    expect(mutateAsync).toHaveBeenCalledWith({
      crewName: "도담",
      memberType: "BOOTCAMP",
      bootcamp: { name: "SSAFY", status: "IN_PROGRESS", cohort: "12기" },
      field: "BACKEND"
    });
  });

  it("Given no bootcamp is chosen, When continuing, Then it asks for a bootcamp first", async () => {
    // Given
    const user = userEvent.setup();
    await startBootcamp(user);

    // When
    await user.click(screen.getByRole("button", { name: "다음" }));

    // Then
    expect(screen.getByText("부트캠프를 선택해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "어느 부트캠프인가요?" })).toBeInTheDocument();
  });

  it("Given Woowahan Tech Course is chosen, When the crew verification button appears, Then it leads to the crew profile", async () => {
    // Given
    const user = userEvent.setup();
    await startBootcamp(user);

    // When
    await user.click(screen.getByRole("radio", { name: "우아한테크코스" }));

    // Then
    const verify = screen.getByRole("button", { name: "우테코 크루 인증" });
    expect(verify).toHaveAttribute("data-ph-capture-attribute-action", "signup_crew_verification_start");
    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    await user.click(verify);
    expect(screen.getByRole("heading", { name: "안녕하세요 크루님 프로필을 작성해주세요" })).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "과정" })).toBeInTheDocument();
  });

  it("Given invalid crew fields, When submitted, Then every invalid field is identified inline", async () => {
    // Given
    const user = userEvent.setup();
    await startCrew(user);

    expect(
      screen.getByRole("heading", { name: "프로필 입력" })
    ).toHaveClass("account-heading__title");

    // When
    await user.type(screen.getByRole("textbox", { name: "크루 이름" }), "a자");
    await user.click(screen.getByRole("button", { name: "가입 완료하기" }));

    // Then
    expect(await screen.findByRole("textbox", { name: "크루 이름" })).toHaveAccessibleDescription(
      expect.stringMatching(/크루 이름은 한글 2~4자/)
    );
    expect(screen.getByRole("combobox", { name: "기수" })).toHaveAccessibleDescription(
      expect.stringMatching(/기수를 선택해 주세요/)
    );
    expect(useSignupMember().mutateAsync).not.toHaveBeenCalled();
  });

  it("Given valid crew fields after verification, When signup succeeds, Then it submits the same crew profile data as before", async () => {
    // Given
    const mutateAsync = jest.fn().mockResolvedValue({
      id: 11,
      crewName: "자리",
      generation: 3,
      course: "FRONTEND",
      joinedAt: "2026-08-21T10:30:00"
    });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    await startCrew(user);

    // When
    await user.type(screen.getByRole("textbox", { name: "크루 이름" }), "자리");
    await user.selectOptions(screen.getByRole("combobox", { name: "과정" }), "FRONTEND");
    await user.selectOptions(screen.getByRole("combobox", { name: "기수" }), "3");
    await submitAndConfirm(user);

    // Then
    expect(mutateAsync).toHaveBeenCalledWith({
      crewName: "자리",
      generation: 3,
      course: "FRONTEND",
      memberType: "CREW"
    });
  });

  it("Given the crew profile, When going back, Then the bootcamp step asks for crew verification again", async () => {
    // Given
    const user = userEvent.setup();
    await startCrew(user);

    // When
    await user.click(screen.getByRole("button", { name: "이전" }));

    // Then
    expect(screen.getByRole("heading", { name: "어느 부트캠프인가요?" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "우아한테크코스" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "우테코 크루 인증" })).toBeInTheDocument();
  });

  it("Given the company path, When the optional company is shared, Then it submits the professional profile", async () => {
    // Given
    const mutateAsync = jest.fn().mockResolvedValue({ id: 13 });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderRoute("/signup", <SignupPage />);

    // When
    await user.click(screen.getByRole("radio", { name: /회사/ }));
    await user.click(screen.getByRole("radio", { name: "프론트엔드" }));
    await user.click(screen.getByRole("radio", { name: "1~3년차" }));
    await user.type(screen.getByRole("textbox", { name: "닉네임" }), "하나");
    await user.type(screen.getByRole("textbox", { name: /회사명/ }), "자리하나");
    await user.click(screen.getByRole("checkbox", { name: "참여자 목록에 회사명 보이기" }));
    await submitAndConfirm(user);

    // Then
    expect(mutateAsync).toHaveBeenCalledWith({
      crewName: "하나",
      memberType: "PROFESSIONAL",
      field: "FRONTEND",
      career: "YEARS_1_3",
      company: { name: "자리하나", visible: true }
    });
  });

  it("Given a duplicate member conflict, When signup fails, Then a safe recovery message is announced", async () => {
    // Given
    const mutateAsync = jest
      .fn()
      .mockRejectedValue({ status: 409, userMessage: "이미 사용 중인 크루 정보예요." });
    useSignupMember.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    await startCrew(user);

    // When
    await user.type(screen.getByRole("textbox", { name: "크루 이름" }), "자리");
    await user.selectOptions(screen.getByRole("combobox", { name: "과정" }), "FRONTEND");
    await user.selectOptions(screen.getByRole("combobox", { name: "기수" }), "3");
    await submitAndConfirm(user);

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
