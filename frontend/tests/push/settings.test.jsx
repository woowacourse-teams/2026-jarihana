import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PushSettings } from "../../src/features/push/PushSettings";
import { disableBrowserPush, enableBrowserPush, pushEnvironment, syncBrowserPush, workerCommand } from "../../src/features/push/browser";

jest.mock("../../src/features/auth", () => ({ useAuth: () => ({ member: { id: 1 }, sessionVersion: 1, logoutPending: false }) }));
jest.mock("../../src/features/push/browser", () => ({ disableBrowserPush: jest.fn(), enableBrowserPush: jest.fn(), pushEnvironment: jest.fn(), syncBrowserPush: jest.fn(), workerCommand: jest.fn() }));
const originalNotification = global.Notification;
beforeEach(() => {
  jest.clearAllMocks();
  global.Notification = { permission: "default", requestPermission: jest.fn(async () => "granted") };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { addEventListener: jest.fn(), removeEventListener: jest.fn() } });
  pushEnvironment.mockReturnValue({ supported: true, installRequired: false });
  syncBrowserPush.mockResolvedValue({ config: { enabled: true, vapidPublicKey: "key" }, registration: {}, active: false });
  workerCommand.mockResolvedValue({ revision: 1, armed: false });
  enableBrowserPush.mockResolvedValue({ armed: true });
  disableBrowserPush.mockResolvedValue(undefined);
});
afterEach(() => { global.Notification = originalNotification; delete navigator.serviceWorker; });
test("opening settings does not request permission; an explicit click requests and binds", async () => {
  render(<PushSettings />);
  const button = await screen.findByRole("button", { name: "켜기" });
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  expect(button).toHaveAttribute("data-ph-capture-attribute-action", "push_permission_request");
  fireEvent.click(button);
  expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(enableBrowserPush).toHaveBeenCalledWith(1, {}, expect.any(Object), { revision: 1, armed: false }, expect.any(Function)));
});
test("denied permission explains browser settings without repeatedly requesting permission", async () => {
  Notification.permission = "denied"; render(<PushSettings />);
  expect(await screen.findByRole("button", { name: "켜기" })).toBeDisabled();
  expect(screen.getByText(/알림 권한이 차단돼 있어요/)).toBeInTheDocument();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});
test("iOS outside the installed app shows installation guidance without subscription calls", () => {
  pushEnvironment.mockReturnValue({ supported: false, installRequired: true }); render(<PushSettings />);
  expect(screen.getByText(/홈 화면에 추가한 뒤 앱을 열어/)).toBeInTheDocument();
  expect(syncBrowserPush).not.toHaveBeenCalled();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});
test("failed server disable can be retried without re-enabling push", async () => {
  syncBrowserPush.mockResolvedValue({ config: { enabled: true }, registration: {}, active: true });
  workerCommand.mockResolvedValue({ armed: true });
  disableBrowserPush.mockRejectedValueOnce(new Error("offline")); render(<PushSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "끄기" }));
  const retry = await screen.findByRole("button", { name: "해제 재시도" });
  await waitFor(() => expect(retry).not.toBeDisabled()); fireEvent.click(retry);
  await waitFor(() => expect(disableBrowserPush).toHaveBeenCalledTimes(2));
  expect(enableBrowserPush).not.toHaveBeenCalled();
});
