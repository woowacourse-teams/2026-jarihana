import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Aperture, ArrowLeft, DoorOpen, House, Mountain, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useChatSession } from "../../features/chat/ChatSessionProvider";
import { chatLocation } from "../../features/chat/ChatLink";
import { useGroupMusic } from "../../features/group-music/index.js";
import { GroupImage, Skeleton, StatusBadge } from "../../shared/ui/index.js";
import { ClubhouseLoading } from "./ClubhouseLoading.jsx";
import { ClubhouseContentDialog } from "./ClubhouseContentDialog.jsx";
import { ClubhouseLandscapeDialog } from "./ClubhouseLandscapeDialog.jsx";
import { useClubhouseContent } from "./useClubhouseContent.js";
import { useClubhouseLandscape } from "./useClubhouseLandscape.js";
import { useClubhousePresence } from "./useClubhousePresence.js";
import { RoomSky } from "../space/RoomSky.jsx";
import { OUTDOOR_PHASES, OUTDOOR_WEATHER } from "../space/roomOutdoors.js";
import { meetingTypeLabel, typeBadgeTone, typeLabel } from "./pageUtils.js";
import "../space/studio-hud-theme.css";
import "./group-clubhouse.css";

const GroupSpaceLoader = lazy(() => import("../space/GroupSpacePage.jsx").then(({ GroupSpaceLoader }) => ({ default: GroupSpaceLoader })));
const CAMERA_FLIGHT_MS = 720;

function activityIdFromItem(item, groupId) {
  if (!item?.link) return null;
  try {
    const url = new URL(item.link, window.location.origin);
    if (url.origin !== window.location.origin || ![`/groups/${groupId}`, `/groups/${groupId}/space`].includes(url.pathname)) return null;
    const id = url.searchParams.get("post") ?? url.searchParams.get("activity");
    return /^[1-9]\d*$/.test(id ?? "") && Number.isSafeInteger(Number(id)) ? Number(id) : null;
  } catch {
    return null;
  }
}

function GroupHeroIdentity({ group, showEmblem = true }) {
  return <div className="group-clubhouse__identity">
    {showEmblem && <span className="group-clubhouse__emblem" aria-hidden="true">
      {group.representativeImageUrl ? <GroupImage group={group} alt="" /> : <Mountain size={38} />}
    </span>}
    <div><h1 id="group-title" tabIndex={-1}>{group.name}</h1><div className="group-clubhouse__badges">
      <StatusBadge tone={typeBadgeTone(group.type)}>{typeLabel(group.type)}</StatusBadge>
      <span>{meetingTypeLabel(group.meetingType)}</span><span><Users size={15} aria-hidden="true" />{group.memberCount}명</span>
    </div></div>
  </div>;
}

export function GroupPhotoDetail({ group, children }) {
  return <div className="group-clubhouse group-clubhouse--web group-clubhouse--photo">
    <section className="group-clubhouse__frontage" aria-labelledby="group-title">
      <GroupImage group={group} className="group-clubhouse__cover" />
      <GroupHeroIdentity group={group} showEmblem={false} />
    </section>
    <div className="group-clubhouse__web">{children}</div>
  </div>;
}

export default function GroupClubhouse({ auth, group, groupId, isMember, setup, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const memberId = auth.member?.id ?? auth.user?.id;
  const canDecorate = Boolean(isMember && memberId === group.leader?.memberId && group.status !== "ENDED");
  const [expanded, setExpanded] = useState(() => /\/space\/?$/.test(location.pathname));
  const [cameraFlight, setCameraFlight] = useState(null);
  const [sceneStatus, setSceneStatus] = useState("loading");
  const [previewExterior, setPreviewExterior] = useState(true);
  const [previewWideAngle, setPreviewWideAngle] = useState(0);
  const [lensOpen, setLensOpen] = useState(false);
  const [backdrop, setBackdrop] = useState(null);
  const [mode, setMode] = useState("use");
  const [contentDialog, setContentDialog] = useState(null);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [displayRecord, setDisplayRecord] = useState(null);
  const frontageRef = useRef(null);
  const sceneRef = useRef(null);
  const visitPointerLockRef = useRef(null);
  const webScroll = useRef(0);
  const expandButton = useRef(null);
  const wasExpanded = useRef(expanded);
  const unsavedSpace = useRef({ dirty: false, saving: false });
  const { openMusic, musicOpen, muted, toggleMuted } = useGroupMusic();
  const { portrait, lockLandscape, releaseLandscape } = useClubhouseLandscape();
  const orientationBlocked = portrait && expanded;
  const chatSession = useChatSession();
  const chatOpen = new URLSearchParams(location.search).has("chat");
  const unreadCount = chatSession?.chat?.rooms.data?.find((room) => String(room.groupId) === String(groupId))?.unreadCount ?? 0;
  const { exhibit, retryExhibit, announcements, retryAnnouncements } = useClubhouseContent(groupId, auth, pinnedIds, expanded);
  const { greetingMembers, speechMessages } =
    useClubhousePresence(group, auth, { listen: expanded, isMember });

  const updateBackdrop = useCallback((color, style, outdoors) => setBackdrop({ color, style, outdoors }), []);
  const updateUnsavedSpace = useCallback((dirty, saving) => { unsavedSpace.current = { dirty, saving }; }, []);
  const ackDisplay = useCallback((requestId) => {
    setDisplayRecord((current) => current?.requestId === requestId ? null : current);
  }, []);
  const updateActivityLinks = useCallback((links) => {
    const ids = [...new Set(links.map((link) => activityIdFromItem({ link }, groupId)).filter(Boolean))];
    setPinnedIds((before) => before.length === ids.length && before.every((id, index) => id === ids[index]) ? before : ids);
  }, [groupId]);

  const backgroundColor = backdrop?.color;
  const outdoors = backdrop?.outdoors;
  const hasWeatherCredit = outdoors?.status === "current" || outdoors?.status === "stale";
  useLayoutEffect(() => {
    const shell = frontageRef.current?.closest(".app-shell");
    if (!shell || !backgroundColor) return undefined;
    shell.style.setProperty("--clubhouse-background", backgroundColor);
    return () => shell.style.removeProperty("--clubhouse-background");
  }, [backgroundColor]);

  useLayoutEffect(() => {
    if (!expanded && wasExpanded.current && webScroll.current) window.scrollTo(0, webScroll.current);
  }, [expanded]);
  useEffect(() => {
    if (expanded) wasExpanded.current = true;
    if (cameraFlight) return;
    if (!expanded && wasExpanded.current) {
      wasExpanded.current = false;
      expandButton.current?.focus({ preventScroll: true });
    }
  }, [expanded, cameraFlight]);
  useEffect(() => {
    if (!cameraFlight) return undefined;
    const timer = window.setTimeout(cameraFlight.finish, cameraFlight.duration + 500);
    return () => window.clearTimeout(timer);
  }, [cameraFlight]);

  const switchPresentation = useCallback((next) => {
    setLensOpen(false);
    setContentDialog(null);
    if (next) {
      webScroll.current = window.scrollY;
      setMode("use");
    } else {
      releaseLandscape();
    }
    const host = sceneRef.current?.querySelector('[data-canvas-status="ready"]');
    const from = host?.getBoundingClientRect();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (from?.width && from.height && !reducedMotion) {
      const flight = {
        from,
        duration: CAMERA_FLIGHT_MS,
        getTargetRect: () => frontageRef.current?.getBoundingClientRect(),
        finish: () => setCameraFlight((current) => current === flight ? null : current)
      };
      setCameraFlight(flight);
    }
    setExpanded(next);
  }, [releaseLandscape]);

  useEffect(() => {
    function guardNavigation(event) {
      const { dirty, saving } = unsavedSpace.current;
      if ((!dirty && !saving) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname) return;
      if (saving || !window.confirm("저장하지 않은 공간 변경이 있어요. 저장하지 않고 나갈까요?")) event.preventDefault();
    }
    document.addEventListener("click", guardNavigation, true);
    return () => document.removeEventListener("click", guardNavigation, true);
  }, []);

  function openWebTab(tab, link) {
    if (link) {
      const destination = new URL(link, window.location.origin);
      if (destination.pathname !== location.pathname && destination.pathname !== `/groups/${groupId}`) {
        navigate(link);
        return;
      }
      navigate({ pathname: location.pathname, search: destination.search }, { preventScrollReset: true });
    } else {
      const params = new URLSearchParams(location.search);
      params.set("tab", tab);
      params.delete("post");
      navigate({ pathname: location.pathname, search: `?${params}` }, { preventScrollReset: true });
    }
    switchPresentation(false);
  }

  function openFeature(feature, item) {
    if (feature === "music") {
      openMusic();
    } else if (feature === "chat" && isMember) {
      navigate(chatLocation(location, groupId), {
        state: { ...location.state, clubhouseChat: true }, preventScrollReset: true
      });
    } else if (["dashboard", "activities"].includes(feature)) {
      setContentDialog({ feature, recordId: activityIdFromItem(item, groupId) });
    } else if (feature === "info") {
      openWebTab("intro");
    }
  }

  function changeMode(next) {
    if (next === "decorate" && !canDecorate) return;
    setContentDialog(null);
    setMode(next);
  }

  function displayActivity(record) {
    if (!canDecorate) return;
    const url = new URL(`/groups/${groupId}`, window.location.origin);
    url.searchParams.set("tab", "activities");
    url.searchParams.set("post", String(record.id));
    setDisplayRecord({ requestId: crypto.randomUUID(), link: url.href });
    changeMode("decorate");
  }

  const clubhouse = {
    mode, canDecorate, onModeChange: changeMode, onOpenFeature: openFeature, activityExhibit: exhibit,
    inputBlocked: Boolean(setup || chatOpen || contentDialog || musicOpen || orientationBlocked), orientationBlocked, unreadCount, muted, toggleMuted,
    onActivityLinksChange: updateActivityLinks, canChat: isMember,
    presentation: expanded ? "immersive" : "web", previewExterior, previewWideAngle, cameraFlight, visitPointerLockRef, onBackdropChange: updateBackdrop,
    onDirtyChange: updateUnsavedSpace, onSceneStatus: setSceneStatus,
    speechMessages, greetingMembers, displayRecord, onRecordDisplayed: ackDisplay,
    announcementText: announcements.records[0]?.title ?? "",
    onOpenAnnouncements: () => openWebTab("announcements")
  };

  return <div className={`group-clubhouse${expanded ? " group-clubhouse--expanded" : " group-clubhouse--web"}`}
    data-mode={mode} data-camera-flight={cameraFlight ? expanded ? "opening" : "closing" : undefined}
    data-background-style={backdrop?.style}
    style={{ "--clubhouse-background": backgroundColor, "--clubhouse-flight-duration": `${CAMERA_FLIGHT_MS}ms`,
      ...(cameraFlight && expanded ? { "--clubhouse-hero-top": `${cameraFlight.from.top}px`, "--clubhouse-hero-left": `${cameraFlight.from.left}px`,
        "--clubhouse-hero-width": `${cameraFlight.from.width}px`, "--clubhouse-hero-height": `${cameraFlight.from.height}px`,
        "--clubhouse-fade-height": `${cameraFlight.from.bottom}px` } : {}) }}>
    <RoomSky outdoors={outdoors} />
    <div className="group-clubhouse__frontage" ref={frontageRef} inert={orientationBlocked}>
      <div className="group-clubhouse__scene" id="group-clubhouse-scene" ref={sceneRef}>
        <Suspense fallback={<div className="route-loading"><Skeleton aria-label="우리 모임 공간 불러오는 중" /></div>}>
          <GroupSpaceLoader groupId={groupId} memberId={memberId} clubhouse={clubhouse} setup={setup} />
        </Suspense>
        <ClubhouseLoading />
      </div>
      <section className="group-clubhouse__hero" aria-label="모임 아지트 미리보기" hidden={expanded && !cameraFlight} inert={expanded || Boolean(cameraFlight)}>
        <GroupHeroIdentity group={group} />
        <div className="group-clubhouse__hero-actions">
          {hasWeatherCredit && <a className="group-clubhouse__weather-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer"
            data-ph-capture-attribute-action="space_weather_source_open">서울 · {OUTDOOR_PHASES[outdoors.phase]} · {OUTDOOR_WEATHER[outdoors.weather]}
            {outdoors.status === "stale" ? " (마지막 확인)" : ""}<span>Open-Meteo</span></a>}
          <div className="group-clubhouse__hero-controls">
            <button type="button" className="group-clubhouse__expand" aria-label="광각 조절" title="광각 조절"
              aria-expanded={lensOpen} aria-controls="group-clubhouse-lens" data-ph-capture-attribute-action="group_space_lens_toggle" onClick={() => setLensOpen((open) => !open)}>
              <Aperture size={20} aria-hidden="true" /><span>광각</span>
            </button>
            <button type="button" className="group-clubhouse__expand" aria-label="건물 외관" aria-pressed={previewExterior} aria-controls="group-clubhouse-scene"
              title={previewExterior ? "건물 외관 숨기기" : "건물 외관 보기"} data-ph-capture-attribute-action="group_space_exterior_toggle"
              onClick={() => setPreviewExterior((visible) => !visible)}>
              <House size={20} aria-hidden="true" /><span>외관 {previewExterior ? "켜짐" : "꺼짐"}</span>
            </button>
          </div>
          <div className="group-clubhouse__lens" id="group-clubhouse-lens" hidden={!lensOpen}>
            <label htmlFor="group-clubhouse-wide-angle">광각 시야</label>
            <span aria-hidden="true">{previewWideAngle ? `${previewWideAngle > 0 ? "+" : ""}${previewWideAngle}%` : "기본"}</span>
            <input id="group-clubhouse-wide-angle" type="range" min={-25} max={25} step={1} value={previewWideAngle}
              aria-valuetext={previewWideAngle ? `기본보다 ${Math.abs(previewWideAngle)}% ${previewWideAngle > 0 ? "넓음" : "좁음"}` : "기본"}
              data-ph-capture-attribute-action="group_space_lens_change" onChange={(event) => setPreviewWideAngle(event.currentTarget.valueAsNumber)} />
          </div>
        </div>
        <button ref={expandButton} type="button" aria-controls="group-clubhouse-scene" aria-expanded={expanded}
          aria-busy={sceneStatus === "loading"} disabled={sceneStatus !== "ready"} className="group-clubhouse__expand group-clubhouse__visit"
          data-ph-capture-attribute-action="group_space_expand" onClick={(event) => {
            if (event.nativeEvent.pointerType !== "touch") visitPointerLockRef.current?.();
            void lockLandscape();
            switchPresentation(true);
          }}>
          <DoorOpen size={20} aria-hidden="true" /><span>{sceneStatus === "loading" ? "공간 불러오는 중…" : sceneStatus === "error" ? "공간 이용 불가" : "놀러가기"}</span>
        </button>
      </section>
      <button type="button" hidden={!expanded} disabled={Boolean(cameraFlight)} className="group-clubhouse__collapse" aria-label="웹 상세로 돌아가기" title="웹 상세로 돌아가기"
        data-ph-capture-attribute-action="group_space_collapse" onClick={() => switchPresentation(false)}>
        <ArrowLeft size={19} aria-hidden="true" />
      </button>
    </div>
    <div className="group-clubhouse__web" hidden={expanded} inert={Boolean(cameraFlight)}>{children}</div>
    <ClubhouseContentDialog selection={expanded && mode === "use" ? contentDialog : null} groupId={groupId} auth={auth}
      exhibit={exhibit} announcements={announcements} onRetry={retryExhibit} onRetryAnnouncements={retryAnnouncements}
      onClose={() => setContentDialog(null)} onSelect={openFeature}
      onOpen={(feature, item) => openWebTab(feature, item?.link)} onDisplayRecord={canDecorate ? displayActivity : undefined} />
    {orientationBlocked && <ClubhouseLandscapeDialog onReturn={() => switchPresentation(false)} />}
  </div>;
}
