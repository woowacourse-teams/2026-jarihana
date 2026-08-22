import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";

import { SignupGuard } from "../../src/app/SignupGuard";
import { storeReturnTarget, useAuth } from "../../src/features/auth";

jest.mock("react-router", () => ({
  Navigate: ({ state, to }) => (
    <output data-login-required={String(state?.loginRequired)}>{to}</output>
  )
}));

jest.mock("../../src/features/auth", () => ({
  ...jest.requireActual("../../src/features/auth"),
  useAuth: jest.fn()
}));

jest.mock("../../src/shared/ui", () => ({
  Button: ({ children, ...properties }) => <button {...properties}>{children}</button>,
  ErrorState: ({ action, title }) => (
    <section>
      <h2>{title}</h2>
      {action}
    </section>
  ),
  Skeleton: (properties) => <div role="status" {...properties} />
}));

afterEach(() => {
  window.sessionStorage.clear();
});

it("redirects a plain anonymous visitor without exposing signup content", () => {
  // Given
  useAuth.mockReturnValue({ status: "anonymous" });

  // When
  render(
    <SignupGuard>
      <p>가입 양식</p>
    </SignupGuard>
  );

  // Then
  expect(screen.getByText("/groups")).toHaveAttribute("data-login-required", "true");
  expect(screen.queryByText("가입 양식")).not.toBeInTheDocument();
});

it("offers auth retry instead of exposing signup content during an outage", () => {
  // Given
  const retry = jest.fn();
  useAuth.mockReturnValue({ retry, status: "unavailable" });

  // When
  render(
    <SignupGuard>
      <p>가입 양식</p>
    </SignupGuard>
  );
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  // Then
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("가입 양식")).not.toBeInTheDocument();
});

it("consumes the stored deep link after signup is complete", () => {
  // Given
  storeReturnTarget("/groups/91");
  useAuth.mockReturnValue({ status: "authenticated" });

  // When
  render(
    <SignupGuard>
      <p>가입 양식</p>
    </SignupGuard>
  );

  // Then
  expect(screen.getByText("/groups/91")).toBeInTheDocument();
  expect(window.sessionStorage.getItem("jarihana:auth:return-target")).toBeNull();
});

it("consumes the stored deep link only once under StrictMode", () => {
  // Given
  storeReturnTarget("/groups/91");
  useAuth.mockReturnValue({ status: "authenticated" });

  // When
  render(
    <StrictMode>
      <SignupGuard>
        <p>가입 양식</p>
      </SignupGuard>
    </StrictMode>
  );

  // Then
  expect(screen.getByText("/groups/91")).toBeInTheDocument();
  expect(screen.queryByText("/my")).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem("jarihana:auth:return-target")).toBeNull();
});

it("preserves the signup form during reload and consumes continuation once authenticated", () => {
  // Given
  let status = "signup-required";
  storeReturnTarget("/my/registrations");
  useAuth.mockImplementation(() => ({ status }));
  const view = render(
    <SignupGuard>
      <p>가입 양식</p>
    </SignupGuard>
  );

  // When
  status = "loading";
  view.rerender(
    <SignupGuard>
      <p>가입 양식</p>
    </SignupGuard>
  );

  // Then
  expect(screen.getByText("가입 양식")).toBeInTheDocument();
  expect(window.sessionStorage.getItem("jarihana:auth:return-target")).toBe("/my/registrations");

  // When
  status = "authenticated";
  view.rerender(
    <SignupGuard>
      <p>가입 양식</p>
    </SignupGuard>
  );

  // Then
  expect(screen.getByText("/my/registrations")).toBeInTheDocument();
  expect(window.sessionStorage.getItem("jarihana:auth:return-target")).toBeNull();
});
