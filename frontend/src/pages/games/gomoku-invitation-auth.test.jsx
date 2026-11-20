import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, peekReturnTarget } from "../../features/auth";
import { gomokuApi } from "../../features/gomoku/api";
import { GomokuInvitationPage } from "./index";
import { OAuthCallbackPage } from "../account/OAuthCallbackPage";

jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: jest.fn(),
  useParams: () => ({ token: "invitation-auth-qa" })
}));
jest.mock("../../features/auth", () => ({
  ...jest.requireActual("../../features/auth"),
  useAuth: jest.fn()
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(),
  useQueryClient: () => ({
    cancelQueries: jest.fn().mockResolvedValue(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn().mockResolvedValue()
  })
}));

const target = "/games/gomoku/invite/invitation-auth-qa";
const preview = { id: 42, hostName: "가을", guestName: null, rule: "RENJU", visibility: "PRIVATE", status: "WAITING" };
let login, navigate, reload, join;
beforeEach(() => {
  sessionStorage.clear();
  login = jest.fn(); navigate = jest.fn(); reload = jest.fn().mockResolvedValue();
  useNavigate.mockReturnValue(navigate);
  useAuth.mockReturnValue({ status: "anonymous", member: null, login, reload });
  useQuery.mockReturnValue({ data: preview, isPending: false, isError: false, refetch: jest.fn() });
  join = jest.spyOn(gomokuApi, "join").mockResolvedValue({ roomId: 42 });
});
afterEach(() => jest.restoreAllMocks());

test("anonymous invitation previews first, saves the exact link, and never joins before authentication", () => {
  render(<GomokuInvitationPage />);
  expect(screen.getByRole("heading", { name: "가을님의 초대" })).toBeVisible();
  expect(login).not.toHaveBeenCalled();
  expect(join).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
  expect(peekReturnTarget()).toBe(target);
  expect(login).toHaveBeenCalledTimes(1);
  expect(join).not.toHaveBeenCalled();
});

test("existing member returns from OAuth to the same invitation and must explicitly join", async () => {
  const view = render(<GomokuInvitationPage />);
  fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 3 }, login, reload });
  view.rerender(<OAuthCallbackPage />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(target, { replace: true }));
  expect(join).not.toHaveBeenCalled();
  expect(peekReturnTarget()).toBeNull();
  view.rerender(<GomokuInvitationPage />);
  expect(join).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
  await waitFor(() => expect(join).toHaveBeenCalledWith(42, "invitation-auth-qa"));
  expect(navigate).toHaveBeenCalledWith("/games/gomoku/rooms/42", { replace: true });
});

test("unregistered OAuth keeps the invitation target while entering signup", async () => {
  const view = render(<GomokuInvitationPage />);
  fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
  useAuth.mockReturnValue({ status: "signup-required", member: null, login, reload });
  view.rerender(<OAuthCallbackPage />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signup", { replace: true }));
  expect(peekReturnTarget()).toBe(target);
  expect(join).not.toHaveBeenCalled();
});

test("an unfinished signup goes directly to signup without starting OAuth again", () => {
  useAuth.mockReturnValue({ status: "signup-required", member: null, login, reload });
  render(<GomokuInvitationPage />);
  fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
  expect(navigate).toHaveBeenCalledWith("/signup");
  expect(peekReturnTarget()).toBe(target);
  expect(login).not.toHaveBeenCalled();
  expect(join).not.toHaveBeenCalled();
});

test("cancelled or failed login preserves the invitation for retry", async () => {
  const view = render(<GomokuInvitationPage />);
  fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
  view.rerender(<OAuthCallbackPage />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 로그인" }));
  expect(login).toHaveBeenCalledTimes(2);
  expect(peekReturnTarget()).toBe(target);
  expect(join).not.toHaveBeenCalled();
});

test.each(["expired", "full"])("%s invitation cannot join after authentication", (state) => {
  useAuth.mockReturnValue({ status: "authenticated", member: { id: 3 }, login, reload });
  useQuery.mockReturnValue({ data: state === "full" ? { ...preview, guestName: "여울" } : undefined, isError: state === "expired", isPending: false });
  render(<GomokuInvitationPage />);
  if (state === "expired") expect(screen.getByRole("alert")).toHaveTextContent("유효하지 않거나 만료된 초대");
  else expect(screen.getByRole("button", { name: "참여하기" })).toBeDisabled();
  expect(join).not.toHaveBeenCalled();
});
