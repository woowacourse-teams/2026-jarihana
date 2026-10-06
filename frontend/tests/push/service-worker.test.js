/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function worker() {
  const saved = { value: undefined };
  const handlers = {};
  const displayed = [];
  const db = { close() {}, transaction() {
    const tx = { objectStore: () => ({
      get() { const request = { result: saved.value }; queueMicrotask(() => tx.oncomplete()); return request; },
      put(value) { saved.value = structuredClone(value); queueMicrotask(() => tx.oncomplete()); }
    }) };
    return tx;
  } };
  const self = { location: { origin: "https://app.test" }, addEventListener: (type, callback) => { handlers[type] = callback; },
    registration: { getNotifications: jest.fn(async () => displayed), showNotification: jest.fn(async (_title, options) => {
      displayed.push({ data: options.data, close: jest.fn() });
    }) }, clients: { claim: jest.fn(), matchAll: jest.fn(async () => []), openWindow: jest.fn() } };
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ success: true,
    data: { notificationId: 5, payloadVersion: 1, eventType: "REGISTRATION_APPROVED" } }) }));
  const context = vm.createContext({ self, ServiceWorkerGlobalScope: class {}, indexedDB: { open() {
    const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request;
  } }, fetch: fetcher, AbortController, URL, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8"), context);
  async function message(type, extra = {}) {
    let promise; let result;
    handlers.message({ data: { protocol: 1, type, ...extra }, source: { url: "https://app.test/" },
      ports: [{ postMessage: (value) => { result = value; } }], waitUntil: (value) => { promise = value; } });
    await promise; return result;
  }
  function push(reference = { notificationId: 5, subscriptionId: 8, generation: 1, payloadVersion: 1 }) {
    let promise; handlers.push({ data: { json: () => reference }, waitUntil: (value) => { promise = value; } }); return promise;
  }
  return { self, fetcher, saved, message, push, handlers };
}
async function bind(w) { return w.message("BIND", { expectedRevision: 0, binding: { id: 8, generation: 1, memberId: 12 } }); }
test("valid push checks binding, uses private no-store lookup and reference-only click data", async () => {
  const w = worker(); await bind(w); await w.push();
  expect(w.fetcher).toHaveBeenCalledWith(expect.stringContaining("subscriptionId=8&generation=1"), expect.objectContaining({ credentials: "include", cache: "no-store", redirect: "error" }));
  expect(w.self.registration.showNotification).toHaveBeenCalledWith("신청 승인", expect.objectContaining({ tag: "jarihana:5", data: expect.objectContaining({ notificationId: 5 }) }));
});
test("old generation never fetches or displays detail", async () => {
  const w = worker(); await bind(w); await w.push({ notificationId: 5, subscriptionId: 8, generation: 2, payloadVersion: 1 });
  expect(w.fetcher).not.toHaveBeenCalled(); expect(w.self.registration.showNotification).not.toHaveBeenCalled();
});
test("logout during content lookup prevents the late detail response from displaying", async () => {
  const w = worker(); await bind(w); const response = deferred(); const started = deferred();
  w.fetcher.mockImplementationOnce(() => { started.resolve(); return response.promise; });
  const push = w.push(); await started.promise;
  const disarmed = await w.message("DISARM"); expect(disarmed.state.armed).toBe(false);
  response.resolve({ ok: true, json: async () => ({ success: true, data: { notificationId: 5, payloadVersion: 1, eventType: "REGISTRATION_APPROVED" } }) });
  await push; expect(w.self.registration.showNotification).not.toHaveBeenCalled();
});
test("disarm acknowledgement waits for an in-progress display and closes it", async () => {
  const w = worker(); await bind(w); const showing = deferred(); const release = deferred();
  const notice = { close: jest.fn() };
  w.self.registration.getNotifications.mockResolvedValue([notice]);
  w.self.registration.showNotification.mockImplementationOnce(() => { showing.resolve(); return release.promise; });
  const push = w.push(); await showing.promise;
  let acknowledged = false;
  const disarm = w.message("DISARM").then(() => { acknowledged = true; });
  await Promise.resolve(); expect(acknowledged).toBe(false);
  release.resolve(); await push; await disarm;
  expect(notice.close).toHaveBeenCalled();
});
test("late subscribe completion cannot rearm after disarm", async () => {
  const w = worker(); await w.message("DISARM");
  expect((await bind(w)).ok).toBe(false);
  expect((await w.message("GET_STATE")).state.armed).toBe(false);
});
test("failed authentication shows only general copy and clicks the inbox", async () => {
  const w = worker(); await bind(w); w.fetcher.mockRejectedValueOnce(new Error("offline")); await w.push();
  const options = w.self.registration.showNotification.mock.calls[0][1];
  expect(options.data.notificationId).toBeNull(); expect(options.body).not.toContain("승인");
  let done;
  w.handlers.notificationclick({ notification: { data: options.data, close: jest.fn() }, waitUntil: (promise) => { done = promise; } });
  await done; expect(w.self.clients.openWindow).toHaveBeenCalledWith("https://app.test/");
});
test("matching click goes through the authenticated app route instead of a payload URL", async () => {
  const w = worker(); await bind(w); await w.push();
  const options = w.self.registration.showNotification.mock.calls[0][1]; let done;
  w.handlers.notificationclick({ notification: { data: { ...options.data, url: "https://evil.test" }, close: jest.fn() }, waitUntil: (promise) => { done = promise; } });
  await done; expect(w.self.clients.openWindow).toHaveBeenCalledWith("https://app.test/notifications/open/5");
});

test("a stale key replacement cannot disarm a newer browser binding", async () => {
  const w = worker(); await bind(w);
  const result = await w.message("DISARM", { expectedRevision: 0 });
  expect(result.ok).toBe(false);
  expect((await w.message("GET_STATE")).state.armed).toBe(true);
});
