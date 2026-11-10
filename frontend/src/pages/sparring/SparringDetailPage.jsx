import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../features/auth";
import { useArenaBridge } from "../../features/sparring/useArenaBridge";
import { Button } from "../../shared/ui";
import { ArenaSettings } from "./ArenaSettings";
import { ENTRY_REVEAL_DURATION, SparringEntry } from "./SparringEntry";
import { ENTRY_GUIDE_DURATION } from "./SparringEntryGuide";
import "./sparring.css";

const statuses = {
  connecting: "실시간 연결 중",
  live: "실시간 연결됨",
  reconnecting: "다시 연결하는 중",
  offline: "오프라인 · 작성한 내용은 그대로 있어요"
};
const clashCameraPreference = "jarihana.sparring.clash-camera";
const arenaViewPreference = "jarihana.sparring.arena-view";
const brawlPreference = "jarihana.sparring.brawl";
const speechOverlapPreference = "jarihana.sparring.speech-overlap";
const characterLimitsPreference = "jarihana.sparring.character-limits";
const entryGuidePreference = "jarihana.sparring.entry-guide-seen";
const validCharacterLimit = value => Number.isInteger(value) && value >= 1 && value <= 8;
function Room({ topicId, member, login, retry, onRetry }) {
  const { frame, error, status, title, topic, loaded, sceneReady, sceneError, selectSide } = useArenaBridge({ topicId, member, login, retry });
  const visible = loaded && sceneReady;
  const [entry, setEntry] = useState("select");
  const [saving, setSaving] = useState(false);
  const [entryError, setEntryError] = useState(null);
  const [guide, setGuide] = useState(null);
  const savingRef = useRef(false);
  const entrySideRef = useRef(null);
  const entered = entry === "entered";
  const leaving = entry === "waiting" && guide !== "reading" && visible && !error && !sceneError;
  const [arenaView, setArenaView] = useState(() => {
    try { return localStorage.getItem(arenaViewPreference) === "original" ? "original" : "compact"; }
    catch { return "compact"; }
  });
  const [brawl, setBrawl] = useState(() => {
    try { return localStorage.getItem(brawlPreference) !== "off"; }
    catch { return true; }
  });
  const [speechOverlap, setSpeechOverlap] = useState(() => {
    try { return localStorage.getItem(speechOverlapPreference) !== "off"; }
    catch { return true; }
  });
  const [characterLimits, setCharacterLimits] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(characterLimitsPreference));
      return { a: validCharacterLimit(saved?.a) ? saved.a : 5, b: validCharacterLimit(saved?.b) ? saved.b : 5 };
    } catch { return { a: 5, b: 5 }; }
  });
  const [clashCamera, setClashCamera] = useState(() => {
    try { return localStorage.getItem(clashCameraPreference) !== "off"; }
    catch { return true; }
  });
  useLayoutEffect(() => {
    if (leaving) frame.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [leaving, frame]);
  useEffect(() => {
    if (guide !== "reading") return;
    const timer = setTimeout(() => setGuide("ready"), ENTRY_GUIDE_DURATION);
    return () => clearTimeout(timer);
  }, [guide]);
  useEffect(() => {
    if (!leaving) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ENTRY_REVEAL_DURATION;
    const timer = setTimeout(() => setEntry("entered"), delay);
    return () => clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    if (!entered) return;
    if (guide === "ready") {
      try { localStorage.setItem(entryGuidePreference, "true"); }
      catch { /* Entry still works when preference storage is unavailable. */ }
    }
    frame.current?.scrollIntoView({ block: "start", behavior: "instant" });
    frame.current?.focus({ preventScroll: true });
    if (entrySideRef.current) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "composer-open", side: entrySideRef.current === "MINT" ? "a" : "b" },
      window.location.origin
    );
    window.dispatchEvent(new Event("resize"));
  }, [entered, frame, guide]);
  async function start(side) {
    if (savingRef.current || entry !== "select") return;
    savingRef.current = true;
    setSaving(true);
    setEntryError(null);
    let showGuide = true;
    try { showGuide = localStorage.getItem(entryGuidePreference) !== "true"; }
    catch { /* Show the guide when its completion cannot be read. */ }
    setGuide(showGuide ? "reading" : null);
    try {
      if (await selectSide(side)) {
        entrySideRef.current = side;
        setEntry("waiting");
      } else setGuide(null);
    } catch (failure) {
      setGuide(null);
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
  useEffect(() => {
    if (visible) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "brawl", value: brawl },
      window.location.origin
    );
  }, [brawl, visible, frame]);
  useEffect(() => {
    if (visible) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "speech-overlap", value: speechOverlap },
      window.location.origin
    );
  }, [speechOverlap, visible, frame]);
  useEffect(() => {
    if (visible) frame.current?.contentWindow?.postMessage(
      { channel: "jarihana-sparring", kind: "character-limits", value: characterLimits },
      window.location.origin
    );
  }, [characterLimits, visible, frame]);
  function changeCharacterLimit(side, value) {
    const next = { ...characterLimits, [side]: Number(value) };
    setCharacterLimits(next);
    try { localStorage.setItem(characterLimitsPreference, JSON.stringify(next)); }
    catch { /* The limit still changes when preference storage is unavailable. */ }
  }
  function changeArenaView(value) {
    setArenaView(value);
    try { localStorage.setItem(arenaViewPreference, value); }
    catch { /* The view still changes when preference storage is unavailable. */ }
  }
  function toggleBrawl() {
    const next = !brawl;
    setBrawl(next);
    try { localStorage.setItem(brawlPreference, next ? "on" : "off"); }
    catch { /* The switch still works when preference storage is unavailable. */ }
  }
  function toggleSpeechOverlap() {
    const next = !speechOverlap;
    setSpeechOverlap(next);
    try { localStorage.setItem(speechOverlapPreference, next ? "on" : "off"); }
    catch { /* The switch still works when preference storage is unavailable. */ }
  }
  return (
    <div className="sparring-detail" data-entry-open={!entered}>
      <div className="sparring-detail__rail" inert={!entered} aria-hidden={!entered}>
        <nav className="sparring-detail__navigation" aria-label="토론 위치">
          <Link className="sparring-detail__back" to="/sparring" aria-label="토론 목록으로" title="토론 목록으로" data-ph-capture-attribute-action="sparring_back">
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
        </nav>
        <div className="sparring-detail__tools">
          <span role="status" className="sparring-connection" data-connection={status}>
            {statuses[status]}
          </span>
          <ArenaSettings ready={visible} arenaView={arenaView} changeArenaView={changeArenaView}
            brawl={brawl} toggleBrawl={toggleBrawl} clashCamera={clashCamera} toggleClashCamera={toggleClashCamera}
            characterLimits={characterLimits} changeCharacterLimit={changeCharacterLimit}
            speechOverlap={speechOverlap} toggleSpeechOverlap={toggleSpeechOverlap} />
        </div>
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
            showGuide={Boolean(guide) && !leaving && !entryError && !error && !sceneError}
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
  const location = useLocation();
  const navigate = useNavigate();
  const { status, member, login, restoring, sessionVersion } = useAuth();
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const preview = query.getAll("preview");
    if (preview.length !== 1 || preview[0] !== "1") return;
    query.delete("preview");
    const search = query.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, {
      replace: true, state: location.state
    });
  }, [location, navigate]);
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
