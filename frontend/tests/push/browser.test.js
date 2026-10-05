import { disableBrowserPush, disarmPush, enableBrowserPush, pushEnvironment } from "../../src/features/push/browser";
import { disconnectPush, registerPush } from "../../src/features/push/api";

jest.mock("../../src/features/push/api", () => ({ disconnectPush: jest.fn(), registerPush: jest.fn() }));
let state;
let registration;
let events;
class Channel {
  constructor() {
    this.port1 = { close: jest.fn() };
    this.port2 = { postMessage: (data) => queueMicrotask(() => this.port1.onmessage({ data })) };
  }
}
beforeEach(() => {
  jest.clearAllMocks(); events = [];
  state = { revision: 1, armed: true, memberId: 1, id: 8, generation: 2 };
  registration = { active: { postMessage(message, ports) {
    events.push(message.type);
    if (message.type === "DISARM") state = { ...state, armed: false, revision: state.revision + 1 };
    if (message.type === "BIND") {
      if (message.expectedRevision !== state.revision) { ports[0].postMessage({ ok: false }); return; }
      state = { ...message.binding, armed: true, revision: state.revision + 1 };
    }
    ports[0].postMessage({ ok: true, state });
  } }, pushManager: { getSubscription: jest.fn(async () => ({ unsubscribe: async () => { events.push("unsubscribe"); return true; } })),
    subscribe: jest.fn(async () => ({ toJSON: () => ({ endpoint: "https://fcm.googleapis.com/new", keys: { p256dh: "public", auth: "auth" } }) })) } };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: jest.fn(async () => registration) } });
  global.MessageChannel = Channel;
  disconnectPush.mockImplementation(async () => { events.push("disconnect"); });
  registerPush.mockResolvedValue({ id: 9, generation: 1, enabled: true });
});
afterEach(() => { delete navigator.serviceWorker; delete global.MessageChannel; });
test("disarm acknowledgement returns only the current member binding", async () => {
  expect(await disarmPush(1)).toEqual({ pushSubscriptionId: 8, generation: 2 });
  expect(state.armed).toBe(false);
  expect(await disarmPush(2)).toBeNull();
});
test("disable first stops local delivery, then disconnects server and browser", async () => {
  await disableBrowserPush(1);
  expect(events).toEqual(["DISARM", "disconnect", "unsubscribe"]);
});
test("another account's endpoint is unsubscribed before a new subscription is registered", async () => {
  await enableBrowserPush(2, registration, { vapidPublicKey: "AQID" }, { ...state });
  expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  expect(state.memberId).toBe(2); expect(state.id).toBe(9);
  expect(events).toEqual(["DISARM", "unsubscribe", "BIND"]);
});
test("account change during subscribe prevents server registration and rearming", async () => {
  let resolve; let current = true;
  registration.pushManager.getSubscription.mockResolvedValue(null);
  registration.pushManager.subscribe.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const operation = enableBrowserPush(2, registration, { vapidPublicKey: "AQID" }, { ...state }, () => current);
  await Promise.resolve(); await Promise.resolve();
  current = false; resolve({ toJSON: () => ({}) });
  await expect(operation).rejects.toThrow("계정이 변경됐어요");
  expect(registerPush).not.toHaveBeenCalled(); expect(events).not.toContain("BIND");
});
test("iOS outside standalone asks for installation instead of automatic permission", () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "iPhone" });
  expect(pushEnvironment().installRequired).toBe(true);
  delete navigator.userAgent;
});
