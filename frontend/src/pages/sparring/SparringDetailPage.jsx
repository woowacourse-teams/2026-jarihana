import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../features/auth";
import { useArenaBridge } from "../../features/sparring/useArenaBridge";
import { Button } from "../../shared/ui";
import { ENTRY_REVEAL_DURATION, SparringEntry } from "./SparringEntry";
import "./sparring.css";

const statuses = {
  connecting: "실시간 연결 중",
  live: "실시간 연결됨",
  reconnecting: "다시 연결하는 중",
  offline: "오프라인 · 작성한 내용은 그대로 있어요"
};
const clashCameraPreference = "jarihana.sparring.clash-camera";
function Room({ topicId, member, login, retry, onRetry }) {
  const { frame, error, status, title, topic, loaded, sceneReady, sceneError, selectSide } = useArenaBridge({ topicId, member, login, retry });
  const visible = loaded && sceneReady;
  const [entry, setEntry] = useState("select");
  const [saving, setSaving] = useState(false);
  const [entryError, setEntryError] = useState(null);
  const savingRef = useRef(false);
  const entrySideRef = useRef(null);
  const entered = entry === "entered";
  const leaving = entry === "waiting" && visible && !error && !sceneError;
  const [arenaView, setArenaView] = useState("compact");
  const [clashCamera, setClashCamera] = useState(() => {
    try { return localStorage.getItem(clashCameraPreference) !== "off"; }
    catch { return true; }
  });
  useLayoutEffect(() => {
    if (leaving) frame.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [leaving, frame]);
  useEffect(() => {
    if (!leaving) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ENTRY_REVEAL_DURATION;
    const timer = setTimeout(() => setEntry("entered"), delay);
    return () => clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    if (!entered) return;
    frame.current?.scrollIntoView({ block: "start", behavior: "instant" });
    frame.current?.focus({ preventScroll: true });
    if (entrySideRef.current) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "composer-open", side: entrySideRef.current === "MINT" ? "a" : "b" },
      window.location.origin
    );
    window.dispatchEvent(new Event("resize"));
  }, [entered, frame]);
  async function start(side) {
    if (savingRef.current || entry !== "select") return;
    savingRef.current = true;
    setSaving(true);
    setEntryError(null);
    try {
      if (await selectSide(side)) {
        entrySideRef.current = side;
        setEntry("waiting");
      }
    } catch (failure) {
      setEntryError(failure instanceof Error ? failure.message : "편을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function watch() {
    if (savingRef.current || !topic || entry !== "select") return;
    setEntryError(null);
    setEntry("waiting");
  }
  useEffect(() => {
    if (visible) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "view", value: arenaView },
      window.location.origin
    );
  }, [arenaView, visible, frame]);
  useEffect(() => {
    if (visible) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "clash-camera", value: clashCamera },
      window.location.origin
    );
  }, [clashCamera, visible, frame]);
  function toggleClashCamera() {
    const next = !clashCamera;
    setClashCamera(next);
    try { localStorage.setItem(clashCameraPreference, next ? "on" : "off"); }
    catch { /* The switch still works when preference storage is unavailable. */ }
  }
  return (
    <div className="sparring-detail" data-entry-open={!entered}>
      <div className="sparring-detail__rail" inert={!entered} aria-hidden={!entered}>
        <nav className="sparring-detail__navigation" aria-label="토론 위치">
          <Link className="sparring-detail__back" to="/sparring" aria-label="토론 목록으로" title="토론 목록으로" data-ph-capture-attribute-action="sparring_back">
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
          <div className="sparring-detail__view-controls">
            <div className="sparring-view-switch" role="group" aria-label="경기장 구도">
              {[["original", "기존 구도"], ["compact", "아담한 구도"]].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={arenaView === value}
                  disabled={!visible}
                  onClick={() => setArenaView(value)}
                  data-ph-capture-attribute-action="sparring_view_change"
                >{label}</button>
              ))}
            </div>
            <button
              type="button"
              className="sparring-camera-switch"
              role="switch"
              aria-label="받아치기 연출"
              aria-checked={clashCamera}
              disabled={!visible}
              title="내가 보낸 받아치기 캡슐을 카메라가 따라가요 · 동작 줄이기 설정에서는 생략"
              onClick={toggleClashCamera}
              data-ph-capture-attribute-action="sparring_clash_camera_toggle"
            >받아치기 연출<span aria-hidden="true" /></button>
          </div>
        </nav>
        <span role="status" className="sparring-connection" data-connection={status}>
          {statuses[status]}
        </span>
      </div>
      {entered && visible && error && (
        <div className="sparring-detail__error" role="alert">
          <p>{error}</p>
          <Button
            onClick={onRetry}
            data-ph-capture-attribute-action="sparring_room_retry"
          >
            다시 불러오기
          </Button>
        </div>
      )}
      <div className="sparring-detail__viewport" data-ready={visible}>
        {!entered && <div className="sparring-detail__entry">
          <SparringEntry
            topic={topic}
            busy={saving}
            waiting={entry === "waiting"}
            leaving={leaving}
            error={entryError || error || sceneError}
            onStart={start}
            onWatch={watch}
            onRetry={onRetry}
          />
        </div>}
        <iframe
          key={retry}
          ref={frame}
          className="sparring-arena-frame"
          inert={!visible || !entered}
          aria-hidden={!visible || !entered}
          src="/sparring-arena/index.html"
          title={`${title} 캡슐 경기장`}
          onLoad={() =>
            frame.current?.contentWindow?.postMessage(
              { channel: "jarihana-sparring", kind: "hello" },
              window.location.origin
            )
          }
        />
      </div>
    </div>
  );
}
export function SparringDetailPage() {
  const [retry, setRetry] = useState(0);
  const { topicId } = useParams();
  const { status, member, login, restoring, sessionVersion } = useAuth();
  if (!/^[1-9]\d*$/.test(topicId)) return <p role="alert">토론 주소가 올바르지 않아요.</p>;
  if (status === "loading" || restoring) return <SparringEntry />;
  return (
    <Room
      key={`${topicId}:${member?.id ?? "guest"}:${sessionVersion}:${retry}`}
      topicId={topicId}
      member={member}
      login={login}
      retry={retry}
      onRetry={() => setRetry(value => value + 1)}
    />
  );
}
