import { disconnectPush, fetchPushConfig, registerPush } from "./api";

let registrationPromise;
export function pushEnvironment() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  return { installRequired: ios && !standalone,
    supported: window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window };
}
function withTimeout(promise, milliseconds = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("푸시 연결 확인에 시간이 걸려요. 다시 시도해 주세요.")), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
export async function ensurePushWorker() {
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        if (!registration.active) await withTimeout(navigator.serviceWorker.ready);
        return registration;
      }).catch((error) => { registrationPromise = undefined; throw error; });
  }
  return withTimeout(registrationPromise);
}
export async function workerCommand(type, payload = {}, registration) {
  const current = registration ?? await ensurePushWorker();
  if (!current.active) throw new Error("푸시 연결을 준비하지 못했어요. 다시 시도해 주세요.");
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("푸시 연결 확인에 시간이 걸려요. 다시 시도해 주세요."));
    }, 6000);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer);
      channel.port1.close();
      if (data?.ok) resolve(data.state);
      else reject(new Error("푸시 연결 상태가 변경됐어요. 다시 확인해 주세요."));
    };
    current.active.postMessage({ protocol: 1, type, ...payload }, [channel.port2]);
  });
}
export async function disarmPush(memberId) {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) return null;
  const before = await workerCommand("DISARM", {}, registration);
  return before.memberId === memberId && before.id ? { pushSubscriptionId: before.id, generation: before.generation } : null;
}
export async function removeBrowserSubscription() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription && !await subscription.unsubscribe()) throw new Error("브라우저 구독 해제를 완료하지 못했어요.");
}
function applicationKey(value) {
  const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}
export async function enableBrowserPush(memberId, registration, config, snapshot, stillCurrent = () => true) {
  let state = snapshot ?? await workerCommand("GET_STATE", {}, registration);
  const checkSession = () => { if (!stillCurrent()) throw new Error("계정이 변경됐어요. 다시 확인해 주세요."); };
  checkSession();
  let subscription = await registration.pushManager.getSubscription();
  checkSession();
  const key = applicationKey(config.vapidPublicKey);
  const oldKey = subscription?.options?.applicationServerKey;
  const differentKey = oldKey && (oldKey.byteLength !== key.byteLength || new Uint8Array(oldKey).some((byte, index) => byte !== key[index]));
  if (subscription && (state.memberId !== memberId || differentKey)) {
    state = await workerCommand("DISARM", { expectedRevision: state.revision }, registration);
    checkSession();
    if (!await subscription.unsubscribe()) throw new Error("이전 브라우저 연결을 해제하지 못했어요.");
    subscription = null;
  }
  checkSession();
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  checkSession();
  const result = await registerPush(subscription);
  checkSession();
  if (!result.enabled) throw new Error("푸시 연결이 비활성 상태예요.");
  return workerCommand("BIND", { expectedRevision: state.revision,
    binding: { memberId, id: result.id, generation: result.generation } }, registration);
}
export async function syncBrowserPush(memberId) {
  const config = await fetchPushConfig();
  if (!config.enabled) {
    await disarmPush(memberId);
    return { config, active: false };
  }
  const registration = await ensurePushWorker();
  const state = await workerCommand("GET_STATE", {}, registration);
  const subscription = await registration.pushManager.getSubscription();
  if (state.memberId !== memberId && subscription) {
    await workerCommand("DISARM", {}, registration);
    await removeBrowserSubscription();
    return { config, registration, active: false };
  }
  if (!state.armed || !subscription || Notification.permission !== "granted") {
    if (state.armed) await workerCommand("DISARM", {}, registration);
    return { config, registration, active: false };
  }
  return { config, registration, active: (await enableBrowserPush(memberId, registration, config)).armed };
}
export async function disableBrowserPush(memberId) {
  const binding = await disarmPush(memberId);
  if (binding) await disconnectPush(binding.pushSubscriptionId);
  await removeBrowserSubscription();
}
