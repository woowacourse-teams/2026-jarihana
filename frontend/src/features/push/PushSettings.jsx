import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { Button } from "../../shared/ui";
import { disableBrowserPush, enableBrowserPush, pushEnvironment, syncBrowserPush, workerCommand } from "./browser";

export function PushSettings({ headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const { member, logoutPending, sessionVersion = 0 } = useAuth();
  const currentSession = useRef(sessionVersion);
  useLayoutEffect(() => { currentSession.current = sessionVersion; }, [sessionVersion]);
  const environment = pushEnvironment();
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [failedDisable, setFailedDisable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [installPrompt, setInstallPrompt] = useState(null);
  const canUsePush = environment.supported && !environment.installRequired;
  useEffect(() => {
    function install(event) { event.preventDefault(); setInstallPrompt(event); }
    window.addEventListener("beforeinstallprompt", install);
    return () => window.removeEventListener("beforeinstallprompt", install);
  }, []);
  useEffect(() => {
    if (!canUsePush) return undefined;
    let alive = true;
    async function load() {
      try {
        const result = await syncBrowserPush(member.id);
        if (result.registration) result.state = await workerCommand("GET_STATE", {}, result.registration);
        if (alive) { setConnection(result); setError(null); }
      } catch { if (alive) setError("푸시 상태를 확인하지 못했어요. 다시 시도해 주세요."); }
    }
    void load();
    const changed = async () => {
      try {
        const state = await workerCommand("GET_STATE");
        if (alive) setConnection((before) => before ? { ...before, state, active: state.armed && state.memberId === member.id } : before);
      } catch { if (alive) setError("푸시 상태를 확인하지 못했어요."); }
    };
    navigator.serviceWorker.addEventListener("message", changed);
    return () => { alive = false; navigator.serviceWorker.removeEventListener("message", changed); };
  }, [canUsePush, member.id, sessionVersion, retry]);

  async function toggle() {
    if (pending || !connection?.state) return;
    const version = sessionVersion;
    const stillCurrent = () => currentSession.current === version;
    setPending(true);
    setError(null);
    try {
      if (connection.active || failedDisable) {
        await disableBrowserPush(member.id);
        if (stillCurrent()) setFailedDisable(false);
      }
      else {
        // The permission call starts directly in the user's click handler.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("브라우저 설정에서 알림 권한을 허용해 주세요.");
        if (!stillCurrent()) return;
        await enableBrowserPush(member.id, connection.registration, connection.config, connection.state, stillCurrent);
      }
      if (stillCurrent()) setRetry((value) => value + 1);
    } catch (failure) {
      if (stillCurrent()) {
        if (connection.active || failedDisable) setFailedDisable(true);
        setError(failure.message);
      }
    }
    finally { if (stillCurrent()) setPending(false); }
  }
  const permissionDenied = canUsePush && Notification.permission === "denied";
  let description = connection?.active ? "이 브라우저에서 푸시를 받고 있어요." : "앱을 닫아도 새 소식을 받을 수 있어요.";
  if (environment.installRequired) description = "iPhone·iPad에서는 홈 화면에 추가한 뒤 앱을 열어 알림을 켜 주세요.";
  else if (!environment.supported) description = "이 환경은 웹푸시를 지원하지 않아요. 알림함은 계속 사용할 수 있어요.";
  else if (connection && !connection.config.enabled) description = "현재 푸시 알림을 준비 중이에요. 알림함에서 소식을 확인해 주세요.";
  else if (permissionDenied) description = "알림 권한이 차단돼 있어요. 브라우저 설정에서 허용해 주세요.";
  return (
    <section aria-label="푸시 설정" className="notification-push-settings">
      <div><Heading>이 브라우저의 푸시 알림</Heading><p>{description}</p></div>
      {canUsePush && connection?.config.enabled ? <Button
        data-ph-capture-attribute-action={connection.active || failedDisable ? "push_disable" : Notification.permission === "default" ? "push_permission_request" : "push_enable"}
        disabled={logoutPending || (permissionDenied && !connection.active && !failedDisable) || !connection.state} onClick={() => void toggle()} pending={pending} size="sm" variant="secondary">
        {failedDisable ? "해제 재시도" : connection.active ? "끄기" : "켜기"}
      </Button> : null}
      {canUsePush && !connection && !error ? <p role="status">푸시 상태 확인 중…</p> : null}
      {error ? <div role="alert"><p>{error}</p><Button data-ph-capture-attribute-action="push_status_retry" onClick={() => setRetry((value) => value + 1)} size="sm" variant="tertiary">다시 확인</Button></div> : null}
      {installPrompt ? <Button data-ph-capture-attribute-action="pwa_install_prompt" onClick={() => {
        void installPrompt.prompt().then(() => setInstallPrompt(null));
      }} size="sm" variant="tertiary">홈 화면에 추가</Button> : null}
    </section>
  );
}
