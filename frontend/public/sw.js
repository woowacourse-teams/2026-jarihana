const EMPTY_STATE = { revision: 0, armed: false, memberId: null, id: null, generation: null };
let stateQueue = Promise.resolve();
function serial(work) {
  const result = stateQueue.then(work);
  stateQueue = result.catch(() => undefined);
  return result;
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("jarihana-push", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("PUSH_STATE_UNAVAILABLE"));
  });
}
async function readState() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly");
      const request = tx.objectStore("state").get("binding");
      tx.oncomplete = () => resolve(request.result ?? { ...EMPTY_STATE });
      tx.onerror = tx.onabort = () => reject(new Error("PUSH_STATE_UNAVAILABLE"));
    });
  } finally { db.close(); }
}
async function writeState(state) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(state, "binding");
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(new Error("PUSH_STATE_UNAVAILABLE"));
    });
    return state;
  } finally { db.close(); }
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function sameBinding(a, b) {
  return a.armed && b.armed && a.revision === b.revision && a.memberId === b.memberId
    && a.id === b.id && a.generation === b.generation;
}
async function closeDisplayed() {
  const notifications = await self.registration.getNotifications();
  notifications.forEach((notification) => notification.close());
}
async function notifyWindows() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: "PUSH_STATE_CHANGED" }));
}
async function command(message) {
  const state = await readState();
  if (message.type === "GET_STATE") return state;
  if (message.type === "DISARM") {
    if (message.expectedRevision !== undefined && message.expectedRevision !== state.revision) throw new Error("STALE_BINDING");
    const changed = await writeState({ ...state, armed: false, revision: state.revision + 1 });
    await closeDisplayed();
    await notifyWindows();
    return changed;
  }
  if (message.type === "BIND") {
    const binding = message.binding;
    if (state.armed && binding?.memberId === state.memberId && binding?.id === state.id
      && binding?.generation === state.generation) return state;
    if (message.expectedRevision !== state.revision || !positive(binding?.memberId)
      || !positive(binding?.id) || !positive(binding?.generation)) throw new Error("STALE_BINDING");
    const changed = await writeState({ ...binding, armed: true, revision: state.revision + 1 });
    await notifyWindows();
    return changed;
  }
  throw new Error("INVALID_COMMAND");
}
const EVENT_COPY = {
  REGISTRATION_SUBMITTED: ["새 신청", "모임에 새로운 신청이 도착했어요."],
  REGISTRATION_APPROVED: ["신청 승인", "모임 신청이 승인되었어요."],
  REGISTRATION_REJECTED: ["신청 결과", "모임 신청 결과를 확인해 주세요."],
  REGISTRATION_SYSTEM_REJECTED: ["신청 결과", "모집 상태 변경으로 신청이 마감되었어요."],
  PARTICIPANT_JOINED: ["모임 참여", "모임 참여가 완료되었어요."]
};
async function receivePush(event) {
  let reference;
  try { reference = event.data?.json(); } catch { return; }
  if (!positive(reference?.notificationId) || !positive(reference?.subscriptionId)
    || !positive(reference?.generation) || reference.payloadVersion !== 1) return;
  const initial = await serial(readState);
  if (!initial.armed || initial.id !== reference.subscriptionId || initial.generation !== reference.generation) return;
  let content;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`/api/notifications/${reference.notificationId}/push-content?subscriptionId=${initial.id}&generation=${initial.generation}`, {
        credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal
      });
      if (response.ok) {
        const envelope = await response.json();
        if (envelope.success && envelope.data?.notificationId === reference.notificationId
          && envelope.data.payloadVersion === 1 && EVENT_COPY[envelope.data.eventType]) content = envelope.data;
      }
    } finally { clearTimeout(timer); }
  } catch { /* An authenticated lookup may fail offline or after session expiry. */ }
  await serial(async () => {
    const current = await readState();
    if (!sameBinding(initial, current)) return;
    const [title, body] = content ? EVENT_COPY[content.eventType] : ["자리하나", "새 소식이 있어요. 알림함에서 확인해 주세요."];
    await self.registration.showNotification(title, {
      body, icon: "/icons/pwa-192.png", tag: `jarihana:${reference.notificationId}`,
      data: { notificationId: content ? reference.notificationId : null, binding: current }
    });
    await notifyWindows();
  });
}
async function openNotification(notification) {
  notification.close();
  const state = await serial(readState);
  const valid = sameBinding(state, notification.data?.binding ?? {}) && positive(notification.data?.notificationId);
  const path = valid ? `/notifications/open/${notification.data.notificationId}` : "/notifications";
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const windowClient = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (windowClient) {
    const navigated = await windowClient.navigate(url);
    if (navigated) await navigated.focus();
  } else { await self.clients.openWindow(url); }
}
if (typeof ServiceWorkerGlobalScope !== "undefined") {
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener("message", (event) => {
    if (event.data?.protocol !== 1 || !event.ports[0] || !event.source?.url
      || new URL(event.source.url).origin !== self.location.origin) return;
    event.waitUntil(serial(() => command(event.data)).then(
      (state) => event.ports[0].postMessage({ ok: true, state }),
      () => event.ports[0].postMessage({ ok: false })
    ));
  });
  self.addEventListener("push", (event) => event.waitUntil(receivePush(event).catch(() => undefined)));
  self.addEventListener("notificationclick", (event) => event.waitUntil(openNotification(event.notification)));
  self.addEventListener("pushsubscriptionchange", (event) => event.waitUntil(serial(() => command({ type: "DISARM" }))));
}
