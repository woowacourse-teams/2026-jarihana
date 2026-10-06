import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../src/features/auth/context";
import { bootstrapAuth } from "../../src/features/auth/bootstrap";
import { logout as logoutRequest } from "../../src/features/auth/api";
import { disarmPush, removeBrowserSubscription } from "../../src/features/push/browser";
import { refreshLogoutBinding } from "../../src/features/push/api";

jest.mock("../../src/features/auth/bootstrap", () => ({ bootstrapAuth: jest.fn() }));
jest.mock("../../src/features/auth/api", () => ({ logout: jest.fn() }));
jest.mock("../../src/features/push/browser", () => ({ disarmPush: jest.fn(), removeBrowserSubscription: jest.fn() }));
jest.mock("../../src/features/push/api", () => ({ refreshLogoutBinding: jest.fn() }));
function Probe() {
  const { status, logout, logoutError, reload } = useAuth();
  return <><output>{status}</output>{logoutError ? <p role="alert">{logoutError}</p> : null}
    <button onClick={() => void logout().catch(() => undefined)}>logout</button>
    <button onClick={() => void reload().catch(() => undefined)}>reload</button></>;
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  bootstrapAuth.mockResolvedValue({ signupCompleted: true, member: { id: 1 } });
  disarmPush.mockResolvedValue({ pushSubscriptionId: 8, generation: 2 });
  logoutRequest.mockResolvedValue(undefined); removeBrowserSubscription.mockResolvedValue(undefined);
});
async function mount() { render(<AuthProvider><Probe /></AuthProvider>); await screen.findByText("authenticated"); }
test("logout waits for local disarm acknowledgement then sends this browser binding", async () => {
  const stopped = deferred(); disarmPush.mockReturnValueOnce(stopped.promise); await mount();
  fireEvent.click(screen.getByText("logout")); expect(logoutRequest).not.toHaveBeenCalled();
  await act(async () => stopped.resolve({ pushSubscriptionId: 8, generation: 2 }));
  await screen.findByText("anonymous");
  expect(logoutRequest).toHaveBeenCalledWith(undefined, { pushSubscriptionId: 8, generation: 2 });
});
test("server failure keeps authenticated state with a retry; disarm failure makes no server request", async () => {
  logoutRequest.mockRejectedValueOnce(new Error("offline")); await mount();
  fireEvent.click(screen.getByText("logout")); await screen.findByRole("alert");
  expect(screen.getByText("authenticated")).toBeInTheDocument();
  expect(removeBrowserSubscription).not.toHaveBeenCalled();
  disarmPush.mockRejectedValueOnce(new Error("worker unavailable"));
  fireEvent.click(screen.getByText("logout"));
  await waitFor(() => expect(disarmPush).toHaveBeenCalledTimes(2));
  expect(logoutRequest).toHaveBeenCalledTimes(1);
});
test("reload that finishes after logout cannot restore the previous account", async () => {
  await mount(); const profile = deferred(); bootstrapAuth.mockReturnValueOnce(profile.promise);
  fireEvent.click(screen.getByText("reload")); fireEvent.click(screen.getByText("logout")); await screen.findByText("anonymous");
  await act(async () => profile.resolve({ signupCompleted: true, member: { id: 1 } }));
  expect(screen.getByText("anonymous")).toBeInTheDocument();
});
test("stale generation is refreshed from the owned subscription before retrying logout", async () => {
  logoutRequest.mockRejectedValueOnce({ code: "PUSH_SUBSCRIPTION_NOT_FOUND" }).mockResolvedValueOnce(undefined);
  refreshLogoutBinding.mockResolvedValue({ pushSubscriptionId: 8, generation: 3 }); await mount();
  fireEvent.click(screen.getByText("logout")); await screen.findByText("anonymous");
  expect(logoutRequest).toHaveBeenLastCalledWith(undefined, { pushSubscriptionId: 8, generation: 3 });
});
test("logout in another tab removes the authenticated UI", async () => {
  await mount();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "jarihana:auth:session", newValue: JSON.stringify({ type: "logout" }) })));
  expect(screen.getByText("anonymous")).toBeInTheDocument();
});

test("another tab disarming during bootstrap does not leave this tab loading", async () => {
  const profile = deferred(); bootstrapAuth.mockReturnValueOnce(profile.promise);
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(bootstrapAuth).toHaveBeenCalled());
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "jarihana:auth:session", newValue: JSON.stringify({ type: "disarm" }) })));
  await act(async () => profile.resolve({ signupCompleted: true, member: { id: 1 } }));
  expect(screen.getByText("authenticated")).toBeInTheDocument();
});
