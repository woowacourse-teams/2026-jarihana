import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../src/features/auth/context";
import { bootstrapAuth } from "../../src/features/auth/bootstrap";
import { ApiError } from "../../src/shared/api";

jest.mock("../../src/features/auth/bootstrap", () => ({
  bootstrapAuth: jest.fn()
}));

jest.mock("../../src/shared/api", () => ({
  ApiError: class ApiError extends Error {},
  apiClient: { setSessionExpiredHandler: jest.fn() }
}));

const AuthStatus = () => {
  const { error, reload, status } = useAuth();
  return (
    <div>
      <output>{status}</output>
      {error ? <span>{error.message}</span> : null}
      <button onClick={() => void reload()} type="button">
        retry
      </button>
    </div>
  );
};

beforeEach(() => {
  bootstrapAuth.mockReset();
});

test("Given React StrictMode, when auth bootstraps, then it requests the session only once", async () => {
  // Given
  bootstrapAuth.mockResolvedValue({
    member: {
      avatarUrl: "https://avatars.githubusercontent.com/u/123",
      course: "FRONTEND",
      crewName: "자리",
      generation: 7,
      id: 12
    },
    signupCompleted: true
  });

  // When
  render(
    <StrictMode>
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    </StrictMode>
  );

  // Then
  await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
  expect(bootstrapAuth).toHaveBeenCalledTimes(1);
});

test("Given an unauthenticated response, when auth bootstraps, then it becomes anonymous", async () => {
  // Given
  const error = new ApiError("expired");
  error.status = 401;
  bootstrapAuth.mockRejectedValue(error);

  // When
  render(
    <AuthProvider>
      <AuthStatus />
    </AuthProvider>
  );

  // Then
  await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
  expect(screen.queryByText("expired")).not.toBeInTheDocument();
});

test("Given a network failure, when auth bootstraps, then it exposes unavailable without claiming anonymous", async () => {
  // Given
  bootstrapAuth.mockRejectedValue(new Error("offline"));

  // When
  render(
    <AuthProvider>
      <AuthStatus />
    </AuthProvider>
  );

  // Then
  await waitFor(() => expect(screen.getByText("unavailable")).toBeInTheDocument());
  expect(screen.getByText("offline")).toBeInTheDocument();
  expect(screen.queryByText("anonymous")).not.toBeInTheDocument();
});

test("Given auth is unavailable, when retry succeeds, then it becomes authenticated", async () => {
  // Given
  bootstrapAuth.mockRejectedValueOnce(new Error("malformed response")).mockResolvedValueOnce({
    member: {
      avatarUrl: "https://avatars.githubusercontent.com/u/123",
      course: "FRONTEND",
      crewName: "자리",
      generation: 7,
      id: 12
    },
    signupCompleted: true
  });
  render(
    <AuthProvider>
      <AuthStatus />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByText("unavailable")).toBeInTheDocument());

  // When
  fireEvent.click(screen.getByRole("button", { name: "retry" }));

  // Then
  await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
  expect(bootstrapAuth).toHaveBeenCalledTimes(2);
});

test("Given signup is incomplete, when auth bootstraps, then signup-required remains distinct", async () => {
  // Given
  bootstrapAuth.mockResolvedValue({ member: null, signupCompleted: false });

  // When
  render(
    <AuthProvider>
      <AuthStatus />
    </AuthProvider>
  );

  // Then
  await waitFor(() => expect(screen.getByText("signup-required")).toBeInTheDocument());
});
