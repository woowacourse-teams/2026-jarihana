import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Eye, EyeOff, Menu, ChevronDown, Camera, Code2, Search, Armchair, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpFromLine, BookOpen, Box,
  Check, ChevronRight, Dices, ExternalLink, Flower2, Grid2X2, House, Image, LampFloor, Lightbulb, LightbulbOff, List, Maximize, Mountain,
  LayoutDashboard, Minus, MousePointer2, Music, Plus, Redo2, RotateCcw, RotateCw, Save, Users,
  Sofa, Sun, Trash2, Undo2, UserRound, Utensils, X
} from "lucide-react";

import ClubhousePlayHud from "./ClubhousePlayHud.jsx";
import { AssetInspector } from "./AssetInspector.jsx";
import { ASSET_SURFACES, surfaceFootprint, transformAttachedItems } from "./assetCustomization";
import { FLOOR_MATERIALS, WALL_MATERIALS } from "./surfaceCatalog";
import { RoomCanvas } from "./RoomCanvas";
import { RoomSky, roomSkyColor } from "./RoomSky.jsx";
import { DEFAULT_OUTDOORS, OUTDOOR_MODES, OUTDOOR_PHASES, OUTDOOR_WEATHER, fixedOutdoors } from "./roomOutdoors.js";
import { useLiveOutdoors } from "./useLiveOutdoors.js";
import { DEFAULT_ROOM_ZOOM, scaleRoomZoom } from "./roomCameraZoom";
import { useGroupMusic } from "../../features/group-music/index.js";
import {
  ACCENT_COLORS, ATMOSPHERE_PRESETS, AVATAR_COLORS, CATALOG, DEFAULT_ATMOSPHERE, FOOD_OPTIONS,
  MAX_ITEMS, ROOM_TEMPLATES, TEMPLATE_ATMOSPHERES, THEMES,
  applyRoomTemplate, canPlace, createInitialRoom, findOpenPosition, historyReducer,
  isSafeRecordLink, loadRoom, restoreCommonFunctionAssets, saveRoom, snapPosition, validateRoom
} from "./roomState";
import { getRoomLayout } from "./roomLayout";
import { featureForRoomItem, ROOM_LIGHT_SWITCH_ID, ROOM_LIGHT_TOGGLE_ACTION } from "./clubhouseInteractions";
import { commonAssetStatus, commonFunctionForItem } from "./commonFunctionAssets";
import { prepareRoomPhoto } from "./roomPhoto";
import "./studio-hud-theme.css";
import "./space-studio.css";

const CATEGORIES = [
  { id: "clubhouse", label: "아지트", icon: House },
  { id: "essentials", label: "공통 기능", shortLabel: "공통", icon: LayoutDashboard },
  { id: "furniture", label: "가구", icon: Armchair },
  { id: "surfaces", label: "벽과 바닥", shortLabel: "벽·바닥", icon: Grid2X2 },
  { id: "atmosphere", label: "분위기", icon: Sun },
  { id: "memories", label: "추억 소품", shortLabel: "추억", icon: Image },
  { id: "personal", label: "내 자리", icon: UserRound }
];
const ITEM_ICONS = { activityBoard: Image, clubDashboard: LayoutDashboard, sofa: Sofa, armchair: Armchair, table: Box, bookshelf: BookOpen,
  plant: Flower2, rug: Grid2X2, stool: Box, memory: Image, bench: Sofa, beanbag: Armchair, diningTable: Utensils, gameTable: Dices, gameShelf: BookOpen, gameChair: Armchair, floorLamp: LampFloor, roundChair: Armchair, clubSofa: Sofa, gameCredenza: BookOpen, loungeRug: Grid2X2, musicConsole: Music };
const TEMPLATE_ICONS = { lounge: Sofa, climbing: Mountain, dining: Utensils, band: Music, boardgame: Dices, study: Code2, photo: Camera };
const FUNCTION_ICONS = { dashboard: LayoutDashboard, activities: Image, music: Music };
const COLOR_NAMES = ["파란 후드", "라일락 후드", "초록 후드", "살구 후드"];
const ATMOSPHERE_RANGES = [
  { field: "ambient", label: "공간 밝기", max: 150, step: 5, unit: "%", action: "space_ambient_change" },
  { field: "sunlight", label: "햇빛 밝기", max: 150, step: 5, unit: "%", action: "space_sunlight_change" },
  { field: "warmth", label: "빛의 따뜻함", max: 100, step: 5, unit: "%", action: "space_light_warmth_change" },
  { field: "sunAngle", label: "햇빛 방향", max: 360, step: 15, unit: "°", action: "space_sun_angle_change" },
  { field: "lamps", label: "전구 밝기", max: 150, step: 5, unit: "%", action: "space_lamp_brightness_change" },
  { field: "shadowSoftness", label: "그림자 부드러움", max: 100, step: 5, unit: "%", action: "space_shadow_softness_change" }
];

function readInitialRoom() {
  try { return loadRoom(window.localStorage); }
  catch { return { room: createInitialRoom(), warning: "브라우저 저장소를 사용할 수 없어요." }; }
}

function IconButton({ label, action, children, className = "", ...props }) {
  return (
    <button aria-label={label} className={`space-icon-button ${className}`} title={label}
      data-ph-capture-attribute-action={action} type="button" {...props}>
      {children}
    </button>
  );
}

function PhotoField({ id, label, photo, busy, onChange, onRemove, uploadAction, removeAction, shared = false }) {
  return <div className="space-studio__photo-field">
    <label htmlFor={id}>{label}</label>
    {photo ? <img className="space-studio__photo-preview" src={photo} alt={label} /> :
      <div className="space-studio__photo-empty"><Image aria-hidden="true" size={26} /><span>함께한 순간을 골라 걸어 주세요.</span></div>}
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
      data-ph-capture-attribute-action={uploadAction} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) onChange(file);
      }} />
    <div className="space-studio__photo-meta"><small>JPG·PNG·WebP, 5MB 이하 · {shared ? "모임원에게 공유" : "이 브라우저에만 저장"}</small>
      {photo && <button className="space-button" type="button" data-ph-capture-attribute-action={removeAction}
        onClick={onRemove}>사진 지우기</button>}
    </div>
  </div>;
}

function ColorChoices({ label, value, onChange, action }) {
  return <fieldset className="space-studio__accent-colors"><legend>{label}</legend>
    {ACCENT_COLORS.map((color) => <button key={color.value} type="button" aria-label={`${label} ${color.name}`}
      aria-pressed={value === color.value} style={{ "--choice-color": color.value }}
      data-ph-capture-attribute-action={action} onClick={() => onChange(color.value)}>
      <span />{value === color.value && <Check aria-hidden="true" size={18} />}
    </button>)}
  </fieldset>;
}

function SurfaceControls({ atmosphere, surfaceTheme, onChange, onStart, onPreview, onCommit }) {
  return <>
    <fieldset className="space-studio__atmosphere-section"><legend>벽과 바닥 재질</legend>
      {[
        { surface: "wall", label: "벽", materials: WALL_MATERIALS },
        { surface: "floor", label: "바닥", materials: FLOOR_MATERIALS }
      ].map(({ surface, label, materials }) => <div key={surface} className="space-studio__material-field">
        <label htmlFor={`space-${surface}-material`}>{label} 재질</label>
        <select id={`space-${surface}-material`} value={atmosphere[`${surface}Material`] || "auto"}
          data-ph-capture-attribute-action={`space_${surface}_material_change`}
          onChange={(event) => onChange({ [`${surface}Material`]: event.target.value })}>
          {materials.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
        <AtmosphereRange field={`${surface}PatternScale`} label={`${label} 패턴 크기`} min={0.5} max={2} step={0.25} unit="배"
          action={`space_${surface}_pattern_scale_change`} value={atmosphere[`${surface}PatternScale`] || 1}
          onStart={onStart} onPreview={onPreview} onCommit={onCommit} />
      </div>)}
      <small>테마 기본 재질을 쓰거나 벽과 바닥을 따로 골라 보세요. 색상은 아래에서 바꿀 수 있어요.</small>
    </fieldset>
    <fieldset className="space-studio__atmosphere-section"><legend>벽과 바닥 색상</legend>
      <AtmosphereColor field="wallColor" label="벽 색상" value={atmosphere.wallColor || surfaceTheme.wall}
        action="space_wall_color_change" codeAction="space_wall_color_code_change"
        onStart={onStart} onPreview={onPreview} onCommit={onCommit} />
      <button className="space-studio__surface-reset" type="button" disabled={!atmosphere.wallColor}
        data-ph-capture-attribute-action="space_wall_color_reset" onClick={() => onChange({ wallColor: "" })}>벽 색상을 테마에 맞추기</button>
      <AtmosphereColor field="floorColor" label="바닥 색상" value={atmosphere.floorColor || surfaceTheme.floor}
        action="space_floor_color_change" codeAction="space_floor_color_code_change"
        onStart={onStart} onPreview={onPreview} onCommit={onCommit} />
      <button className="space-studio__surface-reset" type="button" disabled={!atmosphere.floorColor}
        data-ph-capture-attribute-action="space_floor_color_reset" onClick={() => onChange({ floorColor: "" })}>바닥 색상을 테마에 맞추기</button>
    </fieldset>
  </>;
}

function AtmosphereRange({ field, label, min = 0, max, step, unit, action, value, onStart, onPreview, onCommit }) {
  const id = `space-atmosphere-${field}`;
  return <div className="space-studio__range-field">
    <div className="space-studio__range-heading"><label htmlFor={id}>{label}</label><span aria-hidden="true">{value}{unit}</span></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={`${value}${unit}`}
      data-ph-capture-attribute-action={action} onFocus={onStart} onPointerDown={onStart}
      onChange={(event) => onPreview(field, Number(event.target.value))}
      onPointerUp={onCommit} onPointerCancel={onCommit} onBlur={onCommit}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) onCommit(); }} />
  </div>;
}

function AtmosphereColor({ field, label, value, action, codeAction, onStart, onPreview, onCommit }) {
  const [edit, setEdit] = useState({ source: value, draft: value });
  if (edit.source !== value) setEdit({ source: value, draft: value });
  const draft = edit.source === value ? edit.draft : value;
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  const id = `space-${field}-color`;
  return <div className="space-studio__color-control">
    <div className="space-studio__color-field"><label htmlFor={id}>{label}</label>
      <input className="space-studio__color-code" type="text" aria-label={`${label} 코드`} value={draft}
        maxLength={7} spellCheck={false} autoComplete="off" aria-invalid={!valid}
        aria-describedby={!valid ? `${id}-error` : undefined} data-ph-capture-attribute-action={codeAction}
        onFocus={onStart} onChange={(event) => {
          const next = event.target.value;
          setEdit({ source: value, draft: next });
          if (/^#[0-9a-f]{6}$/i.test(next)) onPreview(field, next.toLowerCase());
        }} onBlur={() => { if (!valid) setEdit({ source: value, draft: value }); onCommit(); }}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      <input id={id} type="color" value={value} data-ph-capture-attribute-action={action} onFocus={onStart}
        onChange={(event) => onPreview(field, event.target.value)} onBlur={onCommit} />
    </div>
    {!valid && <p id={`${id}-error`} className="space-studio__field-error">#과 여섯 자리 색상 코드를 입력해 주세요. 예: #EAD8C9</p>}
  </div>;
}

export function SpaceStudioPage({ initialRoom, onSave, canEdit: editPermission = true, groupContext, savedAt, clubhouse }) {
  const webPreview = clubhouse?.presentation === "web";
  const canEdit = !webPreview && editPermission && (!clubhouse || clubhouse.mode === "decorate");
  const playMode = Boolean(clubhouse && !webPreview && !canEdit);
  const Root = clubhouse ? "section" : "main";
  const { openMusic } = useGroupMusic();
  const [initial] = useState(() => initialRoom ? { room: initialRoom, warning: "" } : readInitialRoom());
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: initial.room, future: [] });
  const [savedRoom, setSavedRoom] = useState(initial.room);
  const [selectedId, setSelectedId] = useState(null);
  const [category, setCategory] = useState(null);
  const [hudHidden, setHudHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(!clubhouse);
  const [cameraOpen, setCameraOpen] = useState(!clubhouse);
  const [playOverlayOpen, setPlayOverlayOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneStatus = clubhouse?.onSceneStatus;
  const updateSceneStatus = useCallback((status) => {
    setSceneReady(status === "ready");
    onSceneStatus?.(status);
  }, [onSceneStatus]);
  const walkInputBlocked = playMode && Boolean(clubhouse.inputBlocked || playOverlayOpen);
  const [generalLighting, setGeneralLighting] = useState(true);
  const hudToggle = useRef(null);
  const [assetCollection, setAssetCollection] = useState("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [placementArea, setPlacementArea] = useState("building");
  const [floorView, setFloorView] = useState("all");
  const [studioView, setView] = useState("perspective");
  const viewBeforeExterior = useRef("perspective");
  const [playView, setPlayView] = useState("firstPerson");
  const view = playMode ? playView : studioView;
  const [previousPreview, setPreviousPreview] = useState(webPreview);
  if (previousPreview !== webPreview) {
    setPreviousPreview(webPreview);
    if (webPreview) setPlayView("firstPerson");
  }
  const [zoom, setZoom] = useState(DEFAULT_ROOM_ZOOM);
  const [cameraReset, setCameraReset] = useState(0);
  const [studioWideAngle, setStudioWideAngle] = useState(0);
  const [studioCameraTurn, setStudioCameraTurn] = useState(null);
  const [previousCanEdit, setPreviousCanEdit] = useState(canEdit);
  if (previousCanEdit !== canEdit) {
    setPreviousCanEdit(canEdit);
    if (canEdit) {
      setPlacementArea("building");
      setFloorView("all");
      setView("perspective");
      setZoom(DEFAULT_ROOM_ZOOM);
      setStudioWideAngle(0);
    }
  }
  const [walkCommand, setWalkCommand] = useState(null);
  const [walkZone, setWalkZone] = useState("현관 앞 마당");
  const walkCommandId = useRef(0);
  const walking = view === "firstPerson" || view === "thirdPerson";
  const exterior = view === "exterior";
  const interior = !walking && !exterior;
  const [thumbnails, setThumbnails] = useState({});
  const [notice, setNotice] = useState(initial.warning);
  const [noticeError, setNoticeError] = useState(Boolean(initial.warning));
  const saveToastTimer = useRef(null);
  const [templateSwitching, setTemplateSwitching] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(initial.room.template || "lounge");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRequest = useRef(0);
  const currentRoom = useRef(initial.room);
  const atmosphereGesture = useRef(null);
  const displayedRequest = useRef(null);
  const handledNoticeRequest = useRef(null);
  const noticeFocusPending = useRef(false);
  const [gestureDirty, setGestureDirty] = useState(false);
  const room = history.present;
  const announcementText = clubhouse?.announcementText;
  const defaultOutdoorMode = groupContext ? "live" : "custom";
  const outdoors = room.atmosphere.outdoors ?? { ...DEFAULT_OUTDOORS, mode: defaultOutdoorMode };
  const { mode: outdoorMode, phase: fixedPhase, weather: fixedWeather } = outdoors;
  const live = useLiveOutdoors(outdoorMode === "live");
  const outdoorLight = useMemo(() => outdoorMode === "fixed"
    ? fixedOutdoors({ phase: fixedPhase, weather: fixedWeather }) : live, [outdoorMode, fixedPhase, fixedWeather, live]);
  const canvasRoom = useMemo(() => announcementText === undefined ? room : { ...room, notice: announcementText },
    [room, announcementText]);
  const onActivityLinksChange = clubhouse?.onActivityLinksChange;
  useEffect(() => {
    onActivityLinksChange?.(room.items.filter((item) => item.kind === "memory" && item.link).map((item) => item.link));
  }, [room.items, onActivityLinksChange]);
  const onBackdropChange = clubhouse?.onBackdropChange;
  const backgroundColor = outdoorLight ? roomSkyColor(outdoorLight) : room.atmosphere.backgroundColor;
  const backgroundStyle = outdoorLight ? "sky" : room.atmosphere.backgroundStyle;
  useEffect(() => { onBackdropChange?.(backgroundColor, backgroundStyle, outdoorLight); },
    [onBackdropChange, backgroundColor, backgroundStyle, outdoorLight]);
  const climbing = room.template === "climbing";
  const layout = getRoomLayout(room);
  const hasMezzanine = Boolean(layout.mezzanine);
  const activeFloorView = hasMezzanine ? floorView : "all";
  const activePlacementArea = !hasMezzanine && placementArea === "mezzanine" ? "building" : placementArea;
  const template = ROOM_TEMPLATES.find((entry) => entry.id === room.template) || ROOM_TEMPLATES[0];
  const surfaceTheme = THEMES.find((entry) => entry.id === room.theme) || THEMES[0];
  const selected = room.items.find((item) => item.id === selectedId);
  const selectedType = CATALOG.find((item) => item.kind === selected?.kind);
  const dirty = JSON.stringify(room) !== JSON.stringify(savedRoom);
  const onDirtyChange = clubhouse?.onDirtyChange;
  useEffect(() => { onDirtyChange?.(dirty, saving); }, [dirty, saving, onDirtyChange]);
  const onHudHiddenChange = clubhouse?.onHudHiddenChange;
  useEffect(() => { onHudHiddenChange?.(hudHidden); }, [hudHidden, onHudHiddenChange]);
  useEffect(() => { if (hudHidden) hudToggle.current?.focus(); }, [hudHidden]);
  const commonAssets = commonAssetStatus(room.items);
  const missingCommonAssets = commonAssets.filter((entry) => !entry.items.length);

  const editNoticeRequest = clubhouse?.editNoticeRequest;
  useEffect(() => {
    if (!editNoticeRequest || !canEdit || handledNoticeRequest.current === editNoticeRequest) return;
    handledNoticeRequest.current = editNoticeRequest;
    noticeFocusPending.current = true;
    setHudHidden(false);
    setMenuOpen(true);
    setCameraOpen(false);
    setCategory("personal"); setView("perspective"); setSelectedId(null);
  }, [editNoticeRequest, canEdit]);
  useEffect(() => {
    if (category === "personal" && noticeFocusPending.current) {
      document.getElementById("space-room-notice")?.focus();
      noticeFocusPending.current = false;
    }
  }, [category, editNoticeRequest]);

  useEffect(() => { currentRoom.current = room; }, [room]);
  useEffect(() => () => { photoRequest.current += 1; }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    function beforeUnload(event) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => () => window.clearTimeout(saveToastTimer.current), []);

  const announce = useCallback((message, error = false, dismissAfter = error ? 0 : 3500) => {
    window.clearTimeout(saveToastTimer.current);
    setNotice(message);
    setNoticeError(error);
    if (dismissAfter) saveToastTimer.current = window.setTimeout(() => setNotice(""), dismissAfter);
  }, []);

  const commitAtmosphereGesture = useCallback(() => {
    const before = atmosphereGesture.current;
    atmosphereGesture.current = null;
    if (before) dispatch({ type: "commit", before });
    setGestureDirty(false);
  }, []);

  const changeRoom = useCallback((next) => {
    if (!canEdit || savingRef.current) return;
    commitAtmosphereGesture();
    currentRoom.current = next;
    dispatch({ type: "change", room: next });
    setNotice("");
    setNoticeError(false);
  }, [canEdit, commitAtmosphereGesture]);

  const displayRequest = clubhouse?.displayRecord;
  const onRecordDisplayed = clubhouse?.onRecordDisplayed;
  useEffect(() => {
    if (!displayRequest || !canEdit || saving || displayedRequest.current === displayRequest.requestId) return;
    displayedRequest.current = displayRequest.requestId;
    const latest = currentRoom.current;
    const position = latest.items.length < MAX_ITEMS && findOpenPosition("memory", latest.items, latest, "building");
    if (!position) {
      announce("액자를 놓을 빈자리가 부족해요. 활동 기록은 그대로 있어요.", true);
      onRecordDisplayed?.(displayRequest.requestId);
      return;
    }
    const item = { id: crypto.randomUUID(), kind: "memory", ...position, rotation: 0,
      title: "활동 기록", note: "", photo: "", link: displayRequest.link };
    changeRoom({ ...latest, items: [...latest.items, item] });
    setHudHidden(false);
    setSelectedId(item.id);
    setMenuOpen(true);
    setCameraOpen(false);
    setCategory("memories");
    setView("perspective");
    setFloorView("all");
    announce("활동 액자를 놓았어요. 공간을 저장하면 모임원에게도 보여요.");
    onRecordDisplayed?.(displayRequest.requestId);
  }, [displayRequest, canEdit, saving, onRecordDisplayed, changeRoom, announce]);

  function changeView(nextView) {
    commitAtmosphereGesture();
    if (playMode) setPlayView(nextView);
    else setView(nextView);
    setWalkCommand(null);
  }

  function toggleExterior() {
    if (exterior) {
      changeView(viewBeforeExterior.current);
      return;
    }
    viewBeforeExterior.current = view;
    changeView("exterior");
  }

  function resetStudioCamera() {
    setCameraReset((value) => value + 1);
    setStudioWideAngle(0);
    setView("perspective");
    setZoom(DEFAULT_ROOM_ZOOM);
  }

  function turnStudioCamera(direction) {
    setStudioCameraTurn((previous) => ({ id: (previous?.id ?? 0) + 1, direction }));
  }

  function changeFloorView(nextFloor) {
    commitAtmosphereGesture();
    setFloorView(nextFloor);
    if (nextFloor !== "all") setPlacementArea(nextFloor === "mezzanine" ? "mezzanine" : "building");
    if (selected && nextFloor !== "all" && (selected.level === 1) !== (nextFloor === "mezzanine")) {
      cancelPhotoRequest();
      setSelectedId(null);
    }
  }

  function changePlacementArea(nextArea) {
    setPlacementArea(nextArea);
    setView(nextArea === "yard" ? "site" : "perspective");
    if (hasMezzanine && nextArea === "mezzanine") changeFloorView("mezzanine");
    else if (activeFloorView === "mezzanine") changeFloorView(nextArea === "yard" ? "all" : "ground");
  }

  function commandWalk(action) {
    if (walkInputBlocked) return;
    setWalkCommand({ id: ++walkCommandId.current, action });
  }

  const updateWalkPosition = useCallback(({ zone }) => { setWalkZone(zone); }, []);

  function startAtmosphereGesture() {
    if (!atmosphereGesture.current) atmosphereGesture.current = currentRoom.current;
  }

  function previewAtmosphere(field, value) {
    if (!canEdit || savingRef.current) return;
    startAtmosphereGesture();
    const latest = currentRoom.current;
    const next = { ...latest, atmosphere: { ...latest.atmosphere, [field]: value } };
    currentRoom.current = next;
    setGestureDirty(JSON.stringify(next.atmosphere) !== JSON.stringify(atmosphereGesture.current.atmosphere));
    dispatch({ type: "preview", room: next });
    setNotice("");
    setNoticeError(false);
  }

  function changeAtmosphere(patch) {
    const latest = currentRoom.current;
    const atmosphere = { ...latest.atmosphere, ...patch };
    if (atmosphere.outdoors === undefined) delete atmosphere.outdoors;
    changeRoom({ ...latest, atmosphere });
  }

  function selectOutdoorMode(mode) {
    if (outdoorMode === mode) return;
    changeAtmosphere({ outdoors: { mode,
      phase: mode === "fixed" && live ? live.phase : fixedPhase,
      weather: mode === "fixed" && live ? live.weather : fixedWeather
    } });
  }

  function cancelPhotoRequest() {
    photoRequest.current += 1;
    setPhotoBusy(false);
  }

  function selectItem(id) {
    if (walking || (clubhouse && !canEdit)) {
      const item = typeof id === "object" ? id : room.items.find((entry) => entry.id === id);
      if (item) openItemFeature(item);
      return;
    }
    commitAtmosphereGesture();
    if (id !== selectedId) cancelPhotoRequest();
    setSelectedId(id);
    const item = room.items.find((entry) => entry.id === id);
    if (item && (item.z >= layout.building.maxZ || item.z < layout.building.minZ ||
      item.x < layout.building.minX || item.x > layout.building.maxX)) {
      setView("site"); setFloorView("all"); setPlacementArea("yard");
    } else if (hasMezzanine && item && activeFloorView !== "all") {
      setFloorView(item.level === 1 ? "mezzanine" : "ground");
      setPlacementArea(item.level === 1 ? "mezzanine" : "building");
    }
    if (item?.kind === "memory") { setMenuOpen(true); if (clubhouse) setCameraOpen(false); setCategory("memories"); }
    if (item?.kind === "musicConsole" && groupContext && !canEdit) openMusic();
  }

  function openItemFeature(item) {
    const feature = featureForRoomItem(item);
    if (feature === "music") {
      if (groupContext) openMusic();
      else announce("모임에 연결된 아지트에서 음악과 재생목록을 설정할 수 있어요.");
    } else if (feature && clubhouse) clubhouse.onOpenFeature(feature, item);
    else announce("실제 모임 아지트에서 공지와 활동 기록을 열 수 있어요.");
  }

  function restoreCommonAssets() {
    try {
      const next = restoreCommonFunctionAssets(room);
      changeRoom(next);
      setView("perspective"); setFloorView("all"); setSelectedId(null);
      announce("빠진 공통 에셋을 추가했어요. 저장하면 모임원도 사용할 수 있어요.");
    } catch (error) { announce(error.message, true); }
  }

  function selectCategory(id) {
    commitAtmosphereGesture();
    cancelPhotoRequest();
    setCategory((current) => current === id ? null : id);
    if (id === "clubhouse") setPendingTemplate(room.template);
  }

  async function importPhoto(file, itemId = null) {
    const request = ++photoRequest.current;
    setPhotoBusy(true);
    try {
      const photo = await prepareRoomPhoto(file);
      if (photoRequest.current !== request) return;
      const latest = currentRoom.current;
      if (itemId && !latest.items.some((item) => item.id === itemId)) return;
      changeRoom(itemId ? { ...latest, items: latest.items.map((item) => item.id === itemId ? { ...item, photo } : item) } :
        { ...latest, coverPhoto: photo });
      announce("사진을 걸었어요. 상단의 저장을 누르면 다음에도 남아요.");
    } catch (error) {
      if (photoRequest.current === request) announce(error.message || "사진을 준비하지 못했어요.", true);
    } finally {
      if (photoRequest.current === request) setPhotoBusy(false);
    }
  }

  function applyTemplate() {
    cancelPhotoRequest();
    try {
      changeRoom(applyRoomTemplate(room, pendingTemplate));
      setSelectedId(null);
      setCategory(null);
      setFloorView("all");
      setPlacementArea("building");
      announce("아지트를 바꿨어요. 이름과 사진, 추억은 그대로 남아 있어요.");
    } catch (error) { announce(error.message, true); }
  }

  const invalidPlacement = useCallback(() => {
    announce("여기에는 놓을 수 없어요. 가구와 벽에서 조금 옮기고 출입구·통로를 비워 주세요.", true);
  }, [announce]);

  function changeItem(id, patch) {
    const item = room.items.find((entry) => entry.id === id);
    if (!item) return;
    if (!canPlace({ ...item, ...patch }, room.items, room)) { invalidPlacement(); return; }
    changeRoom({ ...room, items: transformAttachedItems(room.items, id, patch) });
  }

  function moveItem(id, x, z) {
    const item = room.items.find((entry) => entry.id === id);
    if (!item) return;
    const nextX = snapPosition(x);
    const nextZ = snapPosition(z);
    if (nextX !== item.x || nextZ !== item.z) changeItem(id, { x: nextX, z: nextZ });
  }

  function rotateSelected() {
    if (selected) changeItem(selected.id, { rotation: (selected.rotation + 1) % 4 });
  }

  function addItem(kind) {
    if (room.items.length >= MAX_ITEMS) { announce(`가구는 ${MAX_ITEMS}개까지 놓을 수 있어요.`, true); return; }
    const area = kind === "memory" ? (activeFloorView === "mezzanine" ? "mezzanine" : "building") : activePlacementArea;
    const selectedSurface = CATALOG.find((entry) => entry.kind === kind)?.prop && selected && ASSET_SURFACES[selected.kind] ? selected : null;
    const attached = selectedSurface ? findSurfacePosition(kind, selectedSurface) : null;
    const position = attached || findOpenPosition(kind, room.items, room, area);
    if (!position) { announce("빈자리가 부족해요. 가구를 옮기거나 정리해 주세요.", true); return; }
    const item = { kind, ...position, id: crypto.randomUUID(), rotation: position.rotation || 0 };
    if (kind === "memory") { item.title = "새로운 추억"; item.note = ""; item.photo = ""; item.link = ""; }
    cancelPhotoRequest();
    changeRoom({ ...room, items: [...room.items, item] });
    setSelectedId(item.id);
    if (hasMezzanine && activeFloorView !== "all") setFloorView(item.level === 1 ? "mezzanine" : "ground");
  }

  function findSurfacePosition(kind, parent, existingId, customization) {
    if (!parent || !ASSET_SURFACES[parent.kind]) return null;
    const type = CATALOG.find((entry) => entry.kind === parent.kind);
    const original = customization || room.items.find(item => item.id === existingId);
    for (let surfaceIndex = 0; surfaceIndex < ASSET_SURFACES[parent.kind].length; surfaceIndex++) {
      const area = surfaceFootprint(parent, surfaceIndex, type);
      for (let z = area.z - area.depth / 2 + 0.12; z < area.z + area.depth / 2; z += 0.15)
        for (let x = area.x - area.width / 2 + 0.12; x < area.x + area.width / 2; x += 0.15) {
          const candidate = { ...original, id: existingId || "placing-prop", kind, x, z, rotation: parent.rotation, level: parent.level || 0, parentId: parent.id, surfaceIndex };
          if (canPlace(candidate, room.items, room)) return candidate;
        }
    }
    return null;
  }

  function attachSelected(parentId) {
    if (!selected) return;
    if (!parentId) {
      const position = findOpenPosition(selected.kind, room.items.filter(item => item.id !== selected.id), room, "building", selected.rotation,
        { scaleX: selected.scaleX, scaleY: selected.scaleY, scaleZ: selected.scaleZ });
      if (!position) { invalidPlacement(); return; }
      changeItem(selected.id, { ...position, parentId: undefined, surfaceIndex: undefined });
      return;
    }
    const parent = room.items.find(item => item.id === parentId);
    const position = parent && findSurfacePosition(selected.kind, parent, selected.id);
    if (!position) { invalidPlacement(); return; }
    changeItem(selected.id, position);
  }

  function duplicateSelected() {
    if (!selected) return;
    const contents = room.items.filter(item => item.parentId === selected.id);
    if (room.items.length + contents.length + 1 > MAX_ITEMS) { announce(`가구는 ${MAX_ITEMS}개까지 놓을 수 있어요.`, true); return; }
    const position = selected.parentId ? findSurfacePosition(selected.kind, room.items.find(item => item.id === selected.parentId), undefined, selected) :
      findOpenPosition(selected.kind, room.items, room, selected.level ? "mezzanine" : "building", selected.rotation,
        { scaleX:selected.scaleX,scaleY:selected.scaleY,scaleZ:selected.scaleZ,elevation:selected.elevation });
    if (!position) { invalidPlacement(); return; }
    const id = crypto.randomUUID();
    const copy = { ...selected, ...position, id };
    const children = transformAttachedItems(room.items, selected.id, position).filter(item => item.parentId === selected.id)
      .map(item => ({...item,id:crypto.randomUUID(),parentId:id}));
    const items = [...room.items,copy,...children];
    if (!canPlace(copy, items, room)) { invalidPlacement(); return; }
    changeRoom({ ...room, items });
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selected) return;
    cancelPhotoRequest();
    changeRoom({ ...room, items: room.items.filter((item) => item.id !== selected.id && item.parentId !== selected.id) });
    setSelectedId(null);
  }

  async function handleSave() {
    if (!canEdit || photoBusy || savingRef.current) return;
    commitAtmosphereGesture();
    if (!room.name.trim()) { announce("공간 이름을 입력해 주세요.", true); setMenuOpen(true); if (clubhouse) setCameraOpen(false); setCategory("personal"); return; }
    const invalidLink = room.items.find((item) => item.link && !isSafeRecordLink(item.link));
    if (invalidLink) {
      selectItem(invalidLink.id);
      announce("활동 기록 링크는 http:// 또는 https://로 시작하는 주소를 넣어 주세요.", true);
      return;
    }
    try {
      const draft = validateRoom({ ...room, name: room.name.trim() });
      if (!draft) throw new Error("공간 배치를 확인해 주세요. 편집 내용은 그대로 있어요.");
      let normalized;
      if (onSave) {
        savingRef.current = true;
        setSaving(true);
        normalized = await onSave(draft);
        normalized = validateRoom(normalized);
        if (!normalized) throw new Error("저장 응답을 확인하지 못했어요. 편집 내용은 그대로 있어요.");
      } else normalized = saveRoom(window.localStorage, draft);
      setSavedRoom(normalized);
      currentRoom.current = normalized;
      dispatch({ type: "reset", room: normalized });
      announce(onSave ? "우리 모임 공간을 저장했어요." : "이 브라우저에 공간을 저장했어요.", false, 3500);
    } catch (error) {
      announce(onSave ? error.message || "저장하지 못했어요. 편집 내용은 그대로 있어요." :
        "저장하지 못했어요. 브라우저 저장 공간과 설정을 확인해 주세요. 편집 내용은 그대로 있어요.", true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleCancel() {
    if (savingRef.current) return;
    atmosphereGesture.current = null;
    setGestureDirty(false);
    cancelPhotoRequest();
    currentRoom.current = savedRoom;
    dispatch({ type: "reset", room: savedRoom });
    setSelectedId(savedRoom.items.find((item) => item.kind === "sofa")?.id ?? null);
    setFloorView("all");
    setPlacementArea("building");
    announce("마지막으로 저장한 모습으로 돌아왔어요.");
  }

  function handleHistory(type) {
    if (!canEdit || savingRef.current) return;
    cancelPhotoRequest();
    commitAtmosphereGesture();
    dispatch({ type });
    setFloorView("all");
    setPlacementArea("building");
    setNotice("");
  }

  function confirmLeave(event) {
    if (savingRef.current) {
      event.preventDefault();
      return;
    }
    if (dirty && !window.confirm("저장하지 않은 공간 변경이 있어요. 저장하지 않고 나갈까요?")) event.preventDefault();
  }

  function toggleHud() {
    commitAtmosphereGesture();
    setHudHidden((hidden) => !hidden);
    hudToggle.current?.focus();
  }

  function revealHudOnEscape(event) {
    if (templateSwitching && event.key !== "Tab") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!hudHidden || event.key !== "Escape" || event.target.closest(".space-studio__interaction-menu")) return;
    event.preventDefault();
    event.stopPropagation();
    setHudHidden(false);
    hudToggle.current?.focus();
  }

  function selectSceneItem(id) {
    if (id === ROOM_LIGHT_SWITCH_ID) {
      if (walking && !webPreview) toggleGeneralLighting();
      return;
    }
    if (hudHidden && !id) return;
    if (hudHidden) setHudHidden(false);
    selectItem(id);
  }

  function toggleGeneralLighting() {
    setGeneralLighting((enabled) => !enabled);
  }

  function guardClubhouseNavigation(event) {
    if (templateSwitching) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!clubhouse || clubhouse.onDirtyChange || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || !event.currentTarget.contains(link) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
    confirmLeave(event);
  }

  function toggleClubhouseMode() {
    if (canEdit) {
      commitAtmosphereGesture();
      setSelectedId(null);
      setCategory(null);
    }
    setPlayOverlayOpen(false);
    setWalkCommand(null);
    clubhouse.onModeChange(canEdit ? "use" : "decorate");
  }

  const generalLightButton = <button type="button" className={clubhouse ? "space-studio__edge-button" : "space-studio__general-light"} aria-pressed={generalLighting}
    aria-label="전체 조명" title={generalLighting ? "전체 조명 끄기" : "전체 조명 켜기"}
    data-ph-capture-attribute-action={ROOM_LIGHT_TOGGLE_ACTION} onClick={toggleGeneralLighting}>
    {generalLighting ? <Lightbulb size={18} aria-hidden="true" /> : <LightbulbOff size={18} aria-hidden="true" />}
    <span>{clubhouse ? "조명" : "전체 조명"}</span>
  </button>;
  const saveActions = canEdit && <>
    {!clubhouse && <button className="space-button space-button--quiet" disabled={saving || (!dirty && !photoBusy)}
      data-ph-capture-attribute-action="space_cancel" onClick={handleCancel} type="button">취소</button>}
    <button className="space-button space-button--primary" onClick={handleSave} disabled={photoBusy || saving}
      aria-label={clubhouse && saving ? "저장 중…" : undefined} aria-busy={saving || undefined}
      data-unsaved={clubhouse && dirty ? "true" : undefined}
      title={clubhouse && dirty ? "저장하지 않은 변경" : undefined}
      data-ph-capture-attribute-action="space_save" type="button">
      <Save aria-hidden="true" size={18} /><span>{saving && !clubhouse ? "저장 중…" : "저장"}</span>
    </button>
  </>;
  const menu = <nav key={clubhouse ? clubhouse.mode : undefined}
    className="space-studio__rail" id="space-hud-menu"
    aria-label={clubhouse ? "꾸미기 도구" : "공간 메뉴"} hidden={!clubhouse && !menuOpen}
    aria-hidden={clubhouse && !menuOpen ? true : undefined} inert={Boolean(clubhouse && !menuOpen)}>
    {groupContext && !clubhouse && <Link className="space-studio__rail-link" to={groupContext.backHref} title="모임으로" onClick={confirmLeave}
      data-ph-capture-attribute-action="space_group_return"><House size={23} aria-hidden="true" /><span>모임으로</span></Link>}
    {CATEGORIES.filter(({ id }) => (canEdit || id === "memories") && (!clubhouse || id !== "clubhouse")).map(({ id, label, shortLabel, icon: Icon }) => (
      <button key={id} type="button" aria-pressed={category === id} aria-label={label} title={label} disabled={saving}
        data-ph-capture-attribute-action="space_category_select" onClick={() => { if (!interior) changeView("perspective"); if (clubhouse) setCameraOpen(false); selectCategory(id); }}>
        <Icon aria-hidden="true" size={23} strokeWidth={1.8} /><span>{clubhouse && shortLabel ? shortLabel : label}</span>
      </button>
    ))}
  </nav>;

  const modeControls = <nav className="space-studio__mode-bar" aria-label="공간 보기 방식">
          <button type="button" aria-pressed={view === "perspective"}
            data-ph-capture-attribute-action={clubhouse ? "space_view_toggle" : "space_mode_edit"}
            onClick={() => changeView("perspective")}>{clubhouse ? "입체로 보기" : canEdit ? "꾸미기" : "둘러보기"}</button>
          {!clubhouse && <><button type="button" aria-pressed={view === "thirdPerson"} data-ph-capture-attribute-action="space_mode_third_person"
            onClick={() => changeView("thirdPerson")}>3인칭</button>
          <button type="button" aria-pressed={view === "firstPerson"} data-ph-capture-attribute-action="space_mode_first_person"
            onClick={() => changeView("firstPerson")}>1인칭</button></>}
          {!clubhouse && !walking && layout.terrace && <button type="button" aria-pressed={exterior}
            data-ph-capture-attribute-action="space_view_exterior" onClick={() => changeView("exterior")}>외관</button>}
          {clubhouse && !walking && <button type="button" aria-pressed={view === "top"} data-ph-capture-attribute-action="space_view_toggle"
            onClick={() => setView(view === "top" ? "perspective" : "top")}>위에서 보기</button>}
          {!clubhouse && generalLightButton}
        </nav>;
  const floorControls = interior && hasMezzanine && (!clubhouse || canEdit || cameraOpen) && <section className="space-studio__floors" aria-label={`${template.name} 공간 정보와 층 선택`}>
          <div className="space-studio__floor-info">
            <strong>{layout.displayName}</strong>
            <span>층고 {layout.building.height}m · {(layout.building.maxX - layout.building.minX) * (layout.building.maxZ - layout.building.minZ)}m²</span>
            <small>{layout.groundName} + 중층 라운지</small>
          </div>
          <nav aria-label="꾸밀 층 보기">
            <button type="button" aria-pressed={activeFloorView === "all"} data-ph-capture-attribute-action="space_floor_all"
              onClick={() => changeFloorView("all")}>전체 보기</button>
            <button type="button" aria-pressed={activeFloorView === "ground"} data-ph-capture-attribute-action="space_floor_ground"
              onClick={() => changeFloorView("ground")}>1층 메인 공간</button>
            <button type="button" aria-pressed={activeFloorView === "mezzanine"} data-ph-capture-attribute-action="space_floor_mezzanine"
              onClick={() => changeFloorView("mezzanine")}>중층 라운지</button>
          </nav>
        </section>;
  const cameraControls = <div className="space-studio__camera" id="space-hud-camera" role="toolbar" aria-label="시점 조절">
          {clubhouse && canEdit && <div className="space-studio__camera-turn">
            <IconButton label="카메라 왼쪽 회전" action="space_camera_turn_left" onClick={() => turnStudioCamera(-1)}><RotateCcw size={20} /></IconButton>
            <IconButton label="카메라 오른쪽 회전" action="space_camera_turn_right" onClick={() => turnStudioCamera(1)}><RotateCw size={20} /></IconButton>
          </div>}
          <IconButton label="시점 초기화" action="space_camera_reset" onClick={() => { if (walking) commandWalk("reset"); else resetStudioCamera(); }}><RotateCcw size={22} /></IconButton>
          {!walking && <div className="space-studio__zoom">
            <IconButton label="확대" action="space_zoom_in" onClick={() => setZoom((value) => scaleRoomZoom(value, 1.1))}><Plus size={24} /></IconButton>
            <IconButton label="축소" action="space_zoom_out" onClick={() => setZoom((value) => scaleRoomZoom(value, 1 / 1.1))}><Minus size={24} /></IconButton>
          </div>}
          {!walking && <IconButton label="공간 전체 보기" action="space_fit_view" onClick={() => { setFloorView("all"); setView("site"); setZoom(DEFAULT_ROOM_ZOOM); setCameraReset((value) => value + 1); }}><Maximize size={21} /></IconButton>}
          {clubhouse && canEdit && <label className="space-studio__studio-lens">
            <span>광각 시야 <output>{studioWideAngle ? `+${studioWideAngle}%` : "기본"}</output></span>
            <input type="range" min={0} max={100} step={1} value={studioWideAngle} aria-label="광각 시야"
              aria-valuetext={studioWideAngle ? `기본보다 ${studioWideAngle}% 넓음` : "기본"}
              data-ph-capture-attribute-action="space_camera_wide_angle" onChange={(event) => setStudioWideAngle(event.currentTarget.valueAsNumber)} />
          </label>}
        </div>;
  const historyControls = <div className="space-studio__history" role="toolbar" aria-label="편집 이력">
    <IconButton label="실행 취소" action="space_undo" disabled={!history.past.length && !gestureDirty} onClick={() => handleHistory("undo")}><Undo2 size={20} /></IconButton>
    <IconButton label="다시 실행" action="space_redo" disabled={!history.future.length || gestureDirty} onClick={() => handleHistory("redo")}><Redo2 size={20} /></IconButton>
  </div>;

  return (
    <Root className={`space-studio space-studio--edge${webPreview ? " space-studio--web-preview" : " space-studio--overlay"}${clubhouse ? " space-studio--clubhouse" : ""}${playMode ? " space-studio--clubhouse-play" : ""}${hudHidden ? " space-studio--hud-hidden" : ""}${category && (!clubhouse || canEdit) ? " space-studio--panel-open" : ""}${walking ? " space-studio--walking" : ""}${climbing ? " space-studio--climbing" : ""}`} aria-label={clubhouse ? "모임 아지트" : "모임 공간 꾸미기"}
      data-mode={canEdit ? "decorate" : "use"} onClickCapture={guardClubhouseNavigation} onKeyDownCapture={revealHudOnEscape} style={{ "--studio-background": backgroundColor }}>
      <button hidden={webPreview || playMode || Boolean(clubhouse && !hudHidden)} ref={hudToggle} className="space-studio__hud-toggle" type="button" aria-expanded={!hudHidden}
        aria-controls="space-hud-header space-hud-menu space-hud-scene" aria-label={hudHidden ? "UI 펼치기" : "UI 접기"}
        title={hudHidden ? "UI 펼치기" : "UI 접기"} data-ph-capture-attribute-action="space_hud_toggle" onClick={toggleHud}>
        {!clubhouse && (hudHidden ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />)}
        <span>{hudHidden ? "UI 펼치기" : "UI 접기"}</span>
      </button>
      {clubhouse ? canEdit && <header className="space-studio__header space-studio__clubhouse-toolbar" id="space-hud-header"
        data-mode={canEdit ? "decorate" : "use"} hidden={hudHidden || webPreview}>
        <div className="space-studio__clubhouse-toolbar-row">
          <div className="space-studio__save-actions">
            {saveActions}
            <button type="button" className="space-button space-studio__clubhouse-switch"
              data-ph-capture-attribute-action="space_mode_use" disabled={saving || photoBusy || templateSwitching} onClick={toggleClubhouseMode}>
              <Check size={16} aria-hidden="true" />완료
            </button>
          </div>
          {(dirty || history.past.length > 0 || history.future.length > 0 || gestureDirty) && historyControls}
        </div>
      </header> : <>
        <header className="space-studio__header" id="space-hud-header" hidden={hudHidden || webPreview}>
          <Link className="space-studio__brand" aria-label="자리하나" to="/" onClick={confirmLeave} data-ph-capture-attribute-action="space_home">
            <Armchair aria-hidden="true" size={30} strokeWidth={2.6} /><span>자리하나</span>
          </Link>
          <ChevronRight aria-hidden="true" className="space-studio__breadcrumb" size={20} />
          <div className="space-studio__context">
            {groupContext ? <Link className="space-studio__room-name" to={groupContext.backHref} onClick={confirmLeave}
              data-ph-capture-attribute-action="space_group_return">{groupContext.name}</Link> :
              <span className="space-studio__room-name" title={room.name}>{room.name || "우리 공간"}</span>}
            <span className="space-studio__save-state" title={savedAt || undefined}>
              {saving ? "저장 중…" : groupContext ? dirty ? "저장하지 않은 변경" : canEdit ? "우리 모임의 아지트" : groupContext.preview ? "가입 전 · 기본 공간 미리보기" : "모임원 · 둘러보기" : "공간 꾸미기 체험"}
            </span>
          </div>
          <ChevronRight aria-hidden="true" className="space-studio__breadcrumb" size={20} />
          <h1>{walking ? "공간 둘러보기" : canEdit ? "공간 꾸미기" : "우리 아지트"}</h1>
          <div className="space-studio__save-actions">
            {groupContext && <>
              <IconButton label="모임 음악 열기" action="space_music_open" onClick={openMusic}><Music size={19} /></IconButton>
              <Link className="space-button space-studio__member-link" aria-label={`모임원${Number.isInteger(groupContext.memberCount) ? ` ${groupContext.memberCount}명` : ""}`} to={groupContext.membersHref} onClick={confirmLeave}
                data-ph-capture-attribute-action="space_members_open"><Users size={18} aria-hidden="true" />
                <span>모임원{Number.isInteger(groupContext.memberCount) ? ` ${groupContext.memberCount}명` : ""}</span></Link>
            </>}
            {saveActions}
          </div>
        </header>
        <div className="space-studio__menu" hidden={hudHidden || webPreview}>
          <button className="space-studio__menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="space-hud-menu"
            data-ph-capture-attribute-action="space_menu_toggle" onClick={() => setMenuOpen((open) => !open)}>
            <Menu size={22} aria-hidden="true" /><span>{menuOpen ? "메뉴 접기" : "메뉴 펼치기"}</span>
          </button>
          {menu}
        </div>
      </>}

      {clubhouse && canEdit && <div className={`space-studio__editor-menu${menuOpen ? " space-studio__editor-menu--open" : ""}`}
        hidden={hudHidden || webPreview}>
        <button className="space-studio__menu-toggle space-studio__editor-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="space-hud-menu"
          aria-label={menuOpen ? "메뉴 접기" : "메뉴 펼치기"} title={menuOpen ? "메뉴 접기" : "메뉴 펼치기"}
          data-ph-capture-attribute-action="space_menu_toggle" onClick={() => { commitAtmosphereGesture(); if (!menuOpen) setCameraOpen(false); setMenuOpen((open) => !open); }}>
          <Menu size={20} aria-hidden="true" /><span>메뉴</span>
        </button>
        <button className="space-studio__edge-button space-studio__building-toggle" type="button"
          aria-expanded={category === "clubhouse"} aria-controls="space-template-panel" title="아지트 건물 변경"
          data-ph-capture-attribute-action="space_category_select" onClick={() => {
            if (!interior) changeView("perspective");
            setCameraOpen(false);
            selectCategory("clubhouse");
          }}>
          <House size={20} aria-hidden="true" /><span>건물 변경</span>
        </button>
        {menu}
      </div>}

      <section className={`space-studio__stage${!walking && canEdit && category === "atmosphere" ? " space-studio__stage--atmosphere" : ""}`}
        aria-label="공간 배치" aria-busy={templateSwitching || undefined} data-background-style={backgroundStyle}>
        {!clubhouse && <RoomSky outdoors={outdoorLight} />}
        <RoomCanvas editable={canEdit && !saving && !hudHidden && !exterior} focusBuilding={canEdit} room={canvasRoom} signName={groupContext?.name} outdoorLight={outdoorLight} selectedId={canEdit && !hudHidden && !exterior ? selectedId : null} onSelect={selectSceneItem} onMove={moveItem}
          onInvalid={invalidPlacement} interactive={!clubhouse?.cameraFlight && !clubhouse?.orientationBlocked && !templateSwitching} view={webPreview ? "front" : view} previewExterior={clubhouse?.previewExterior} previewWideAngle={clubhouse?.previewWideAngle} zoom={webPreview ? 1 : zoom} cameraReset={cameraReset} onZoomChange={setZoom} floorView={webPreview || (clubhouse && exterior) ? "all" : activeFloorView} onThumbnails={canEdit && !templateSwitching && (category === "furniture" || category === "memories") ? setThumbnails : undefined}
          visitPointerLockRef={clubhouse?.visitPointerLockRef} walkCommand={walkCommand}
          onExitWalk={playMode ? undefined : () => changeView("perspective")} onWalkPosition={playMode ? undefined : updateWalkPosition}
          playMode={playMode} walkInputBlocked={walkInputBlocked} preserveWalkPose={Boolean(clubhouse && !webPreview)}
          studioWideAngle={canEdit && clubhouse ? studioWideAngle : 0} studioCameraTurn={studioCameraTurn}
          onStatusChange={updateSceneStatus}
          avatarAppearance={clubhouse?.avatarAppearance} activityExhibit={clubhouse?.activityExhibit} speechMessages={clubhouse?.speechMessages} greetingMembers={clubhouse?.greetingMembers} cameraFlight={clubhouse?.cameraFlight}
          generalLighting={generalLighting} onTemplateTransition={setTemplateSwitching} />

        {playMode && !clubhouse.cameraFlight && <ClubhousePlayHud
          view={playView} onViewChange={changeView} onOpenFeature={clubhouse.onOpenFeature}
          canChat={clubhouse.canChat} unreadCount={clubhouse.unreadCount}
          onDecorate={editPermission && clubhouse.canDecorate !== false ? toggleClubhouseMode : undefined}
          muted={clubhouse.muted} onToggleMuted={clubhouse.toggleMuted}
          generalLighting={generalLighting} onToggleLighting={toggleGeneralLighting}
          inputBlocked={clubhouse.inputBlocked} onOverlayChange={setPlayOverlayOpen} ready={sceneReady} />}

        <div className="space-studio__scene-ui" id="space-hud-scene" hidden={hudHidden || webPreview || playMode}>
        {clubhouse && canEdit && <section className="space-studio__view-tools" aria-label="View 도구">
          <button className="space-studio__view-toggle space-studio__edge-button" type="button" aria-expanded={cameraOpen} aria-controls="space-view-tools"
            aria-label={cameraOpen ? "시점 도구 접기" : "시점 도구 펼치기"}
            data-ph-capture-attribute-action="space_camera_tools_toggle" onClick={() => {
              commitAtmosphereGesture();
              if (!cameraOpen) setMenuOpen(false);
              if (category === "clubhouse") setCategory(null);
              setCameraOpen((open) => !open);
            }}>
            <Camera size={20} aria-hidden="true" /><span>보기</span>
          </button>
          <div className="space-studio__view-content space-studio__view-content--editor" id="space-view-tools"
            role="group" aria-label="층과 카메라 설정" hidden={!cameraOpen}>
            {floorControls}{modeControls}{cameraControls}
          </div>
          <button type="button" className="space-studio__edge-button" aria-label="UI 접기" title="UI 숨기기"
            data-ph-capture-attribute-action="space_hud_toggle" onClick={toggleHud}><EyeOff size={20} aria-hidden="true" /><span>UI 접기</span></button>
          {generalLightButton}
          <button type="button" className="space-studio__edge-button" aria-label="건물 외관" aria-pressed={exterior}
            title={exterior ? "건물 외관 숨기기" : "건물 외관 보기"}
            data-ph-capture-attribute-action="space_view_exterior" onClick={toggleExterior}>
            <House size={20} aria-hidden="true" /><span>외관</span>
          </button>
        </section>}
        {!clubhouse && modeControls}
        {walking && <div className="space-studio__walk-zone" aria-live="polite"><House size={16} aria-hidden="true" />{walkZone}</div>}

        {!clubhouse && !walking && <div className="space-studio__top-left">
          <button className="space-button space-button--glass" aria-pressed={view === "top"}
            data-ph-capture-attribute-action="space_view_toggle" type="button"
            onClick={() => setView(view === "top" ? "perspective" : "top")}>
            <Box aria-hidden="true" size={22} />{view === "top" ? "입체로 보기" : "위에서 보기"}
          </button>
          <span className="space-studio__local-note">{groupContext ? canEdit ? "모임장 · 공간 편집" : groupContext.preview ? "기본 공간 미리보기" : "모임원과 함께 보는 공간" : "체험 공간 · 이 브라우저에 저장"}{dirty ? " · 편집 중" : ""}</span>
          <span className="space-studio__local-note" title={canEdit ? "가구를 드래그하면 배치가 바뀌고, 빈 공간을 드래그하면 시점이 회전해요." : undefined}>드래그 회전 · 우클릭/Shift+드래그 이동 · 휠 확대·축소</span>
        </div>}

        {!clubhouse && <div className="space-studio__camera-cluster">
          <button className="space-studio__camera-toggle" type="button" aria-expanded={cameraOpen} aria-controls="space-hud-camera"
            aria-label={cameraOpen ? "시점 도구 접기" : "시점 도구 펼치기"} title={cameraOpen ? "시점 도구 접기" : "시점 도구 펼치기"}
            data-ph-capture-attribute-action="space_camera_tools_toggle" onClick={() => setCameraOpen((open) => !open)}>
            <Camera size={21} aria-hidden="true" /><span>{cameraOpen ? "시점 도구 접기" : "시점 도구 펼치기"}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        <div hidden={!cameraOpen}>{cameraControls}</div>
        </div>}

        {!clubhouse && !walking && canEdit && historyControls}

        {!walking && (!clubhouse || canEdit) && <details className="space-studio__inventory">
          <summary data-ph-capture-attribute-action="space_inventory_toggle"><List aria-hidden="true" size={17} />배치한 가구 <span>{room.items.length}</span></summary>
          <div className="space-studio__inventory-list" aria-label="배치한 가구 목록">
            {room.items.map((item, index) => (
              <button aria-pressed={item.id === selectedId} key={item.id} type="button"
                data-ph-capture-attribute-action="space_item_select" onClick={() => selectItem(item.id)}>
                <span>{item.kind === "memory" ? item.title : `${CATALOG.find((entry) => entry.kind === item.kind)?.name} ${index + 1}`}</span>
                {item.id === selectedId && <Check aria-hidden="true" size={16} />}
              </button>
            ))}
            {!room.items.length && <p>아래 목록에서 가구를 골라 주세요.</p>}
          </div>
        </details>}

        {!clubhouse && floorControls}

        {interior && canEdit && selected && !["atmosphere", "surfaces"].includes(category) && (
          <div className="space-studio__selection" role="toolbar" aria-label="선택한 가구 조작">
            <div className="space-studio__selection-title"><span className="space-studio__selection-dot" /><strong>{selectedType?.name}</strong>
              <IconButton label="가구 선택 해제" action="space_selection_clear" onClick={() => selectItem(null)}><X size={16} /></IconButton>
            </div>
            <div className="space-studio__selection-actions">
              {commonFunctionForItem(selected) && (clubhouse || groupContext) && <IconButton label={`${commonFunctionForItem(selected).shortLabel} 열기`}
                action={commonFunctionForItem(selected).action} onClick={() => openItemFeature(selected)}><ExternalLink size={19} /></IconButton>}
              <IconButton label="가구 왼쪽으로 이동" action="space_item_move_left" onClick={() => moveItem(selected.id, selected.x - 0.25, selected.z)}><ArrowLeft size={19} /></IconButton>
              <IconButton label="가구 뒤로 이동" action="space_item_move_back" onClick={() => moveItem(selected.id, selected.x, selected.z - 0.25)}><ArrowUp size={19} /></IconButton>
              <IconButton label="가구 앞으로 이동" action="space_item_move_forward" onClick={() => moveItem(selected.id, selected.x, selected.z + 0.25)}><ArrowDown size={19} /></IconButton>
              <IconButton label="가구 오른쪽으로 이동" action="space_item_move_right" onClick={() => moveItem(selected.id, selected.x + 0.25, selected.z)}><ArrowRight size={19} /></IconButton>
              <span className="space-studio__control-divider" />
              <IconButton label="가구 90도 회전" action="space_item_rotate" onClick={rotateSelected}><RotateCw size={20} /></IconButton>
              <IconButton label="가구 삭제" action="space_item_delete" className="space-icon-button--danger" onClick={deleteSelected}><Trash2 size={18} /></IconButton>
            </div>
            <AssetInspector item={selected} items={room.items} onChange={(patch) => changeItem(selected.id, patch)}
              onAttach={attachSelected} onDuplicate={duplicateSelected} />
          </div>
        )}

        <div hidden={Boolean(clubhouse && !menuOpen && category !== "clubhouse")}>
        {!walking && canEdit && category === "essentials" && <aside className="space-studio__panel space-studio__essentials" aria-label="공통 기능 에셋">
          <div className="space-studio__panel-heading"><LayoutDashboard aria-hidden="true" size={20} /><h2>어느 아지트에서나</h2>
            <IconButton label="공통 기능 닫기" action="space_common_assets_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton>
          </div>
          <p className="space-studio__panel-intro">취미가 달라도 같은 표식을 찾아보세요.<br />위치와 배치는 자유롭게 바꿀 수 있어요.</p>
          <div className="space-studio__essential-list">
            {commonAssets.map((asset) => {
              const Icon = FUNCTION_ICONS[asset.feature];
              return <section className="space-studio__essential-card" key={asset.kind} style={{ "--function-color": asset.color }}>
                <div className="space-studio__essential-title"><Icon size={23} aria-hidden="true" /><h3>{asset.name}</h3>
                  <span>{asset.items.length ? `${asset.items.length}개 배치` : "미배치"}</span></div>
                <p>{asset.description}</p>
                <div className="space-studio__essential-actions">
                  {asset.items.length > 0 && <button type="button" className="space-button" data-ph-capture-attribute-action="space_common_asset_select"
                    onClick={() => selectItem(asset.items[0].id)}>선택</button>}
                  <button type="button" className="space-button" data-ph-capture-attribute-action="space_item_add" onClick={() => addItem(asset.kind)}><Plus size={16} aria-hidden="true" />추가</button>
                  {!clubhouse && groupContext && asset.feature === "music" && <button type="button" className="space-button" data-ph-capture-attribute-action={asset.action}
                    onClick={() => openItemFeature({ kind: asset.kind })}>열기<ExternalLink size={15} aria-hidden="true" /></button>}
                </div>
              </section>;
            })}
          </div>
          <button type="button" className="space-button space-button--primary space-studio__apply" disabled={!missingCommonAssets.length || saving}
            data-ph-capture-attribute-action="space_common_assets_restore" onClick={restoreCommonAssets}>
            {missingCommonAssets.length ? `빠진 공통 에셋 ${missingCommonAssets.length}개 추가` : "공통 에셋이 모두 있어요"}</button>
          <p className="space-studio__panel-note">에셋을 지워도 기록·공지·음악 설정은 남아요. 가장자리 메뉴에서도 같은 기능을 열 수 있어요.</p>
        </aside>}

        {!walking && canEdit && category === "clubhouse" && <aside className="space-studio__panel" id="space-template-panel" aria-label="아지트 템플릿">
          <div className="space-studio__panel-heading"><House aria-hidden="true" size={20} /><h2>어떤 아지트로 모일까요?</h2>
            <IconButton label="아지트 선택 닫기" action="space_template_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton>
          </div>
          <p className="space-studio__panel-intro">취미에 맞는 시설과 구조에<br />우리 모임의 자리를 더해 보세요.</p>
          <div className="space-studio__templates" aria-label="취미별 기본 공간">
            {ROOM_TEMPLATES.map((entry) => {
              const Icon = TEMPLATE_ICONS[entry.id] || House;
              return <button key={entry.id} type="button" className={`space-studio__template space-studio__template--${entry.id}`}
                aria-label={entry.name} aria-pressed={pendingTemplate === entry.id}
                data-ph-capture-attribute-action="space_template_select" onClick={() => setPendingTemplate(entry.id)}>
                <span className="space-studio__template-icon"><Icon aria-hidden="true" size={30} /></span>
                <span className="space-studio__template-copy"><strong>{entry.name}</strong><span>{entry.description}</span><small>{entry.facility}</small></span>
                {pendingTemplate === entry.id && <Check aria-hidden="true" size={18} />}
              </button>;
            })}
          </div>
          <p className="space-studio__template-notice">{TEMPLATE_ATMOSPHERES[pendingTemplate] ? "구조·가구·배경·조명이 테마에 맞게 바뀝니다." : "구조와 가구가 테마에 맞게 바뀝니다."} 이름·사진·추억은 유지하며, 실행 취소로 되돌릴 수 있어요.</p>
          <button className="space-button space-button--primary space-studio__apply" type="button"
            data-ph-capture-attribute-action="space_template_apply" onClick={applyTemplate}>이 아지트로 꾸미기</button>
          <small className="space-studio__panel-note">동아리와 스터디에 어울리는 테마를 골라 보세요.</small>
        </aside>}

        {!walking && canEdit && category === "personal" && <aside className="space-studio__panel" aria-label="우리 모임 설정">
          <div className="space-studio__panel-heading"><House aria-hidden="true" size={20} /><h2>우리 모임의 흔적</h2>
            <IconButton label="모임 설정 닫기" action="space_identity_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton>
          </div>
          <label htmlFor="space-room-name">공간 이름</label>
          <input id="space-room-name" value={room.name} maxLength={30} data-ph-capture-attribute-action="space_name_change"
            onChange={(event) => changeRoom({ ...room, name: event.target.value })} />
          <PhotoField shared={Boolean(groupContext)} id="space-cover-photo" label="대표 사진" photo={room.coverPhoto} busy={photoBusy}
            uploadAction="space_cover_photo_choose" removeAction="space_cover_photo_remove" onChange={(file) => importPhoto(file)}
            onRemove={() => { cancelPhotoRequest(); changeRoom({ ...room, coverPhoto: "" }); }} />
          {clubhouse?.onOpenAnnouncements
            ? <button className="space-button" type="button" onClick={clubhouse.onOpenAnnouncements}
                data-ph-capture-attribute-action="group_announcement_tab_open">모임 공지 관리</button>
            : <>
              <label htmlFor="space-room-notice">모임 공지</label>
              <textarea id="space-room-notice" value={room.notice || ""} rows={3} maxLength={100}
                placeholder="모임원에게 알릴 내용을 남겨 주세요."
                data-ph-capture-attribute-action="space_notice_change" onChange={(event) => changeRoom({ ...room, notice: event.target.value })} />
              <small className="space-studio__panel-note">100자 이내 · 공간을 저장하면 모임 대시보드에 반영돼요.</small>
            </>}
          <ColorChoices label={room.template === "climbing" ? "홀드 색상" : "모임 색상"} value={room.accentColor}
            action="space_accent_color_change" onChange={(accentColor) => changeRoom({ ...room, accentColor })} />
          {room.template === "climbing" && <ColorChoices label="매트 색상" value={room.matColor}
            action="space_mat_color_change" onChange={(matColor) => changeRoom({ ...room, matColor })} />}
          {room.template === "dining" && <fieldset className="space-studio__food-options"><legend>식탁 위 음식 소품</legend>
            {FOOD_OPTIONS.map((food) => <button type="button" key={food.id} aria-pressed={room.food === food.id}
              data-ph-capture-attribute-action="space_food_change" onClick={() => changeRoom({ ...room, food: food.id })}>{food.name}</button>)}
          </fieldset>}
          <fieldset className="space-studio__avatar-colors"><legend>장식 캐릭터 옷</legend>
            {AVATAR_COLORS.map((color, index) => <button type="button" key={color} aria-label={COLOR_NAMES[index]}
              aria-pressed={room.avatarColor === color} style={{ "--avatar-color": color }}
              data-ph-capture-attribute-action="space_avatar_color_change" onClick={() => changeRoom({ ...room, avatarColor: color })}>
              {room.avatarColor === color ? <Check aria-hidden="true" size={20} /> : <UserRound aria-hidden="true" size={20} />}
            </button>)}
          </fieldset>
          {photoBusy && <p className="space-studio__photo-status" role="status">사진을 준비하고 있어요…</p>}
        </aside>}

        {!walking && canEdit && category === "surfaces" && <aside className="space-studio__panel space-studio__atmosphere space-studio__surfaces" aria-label="벽과 바닥 꾸미기">
          <div className="space-studio__panel-heading"><Grid2X2 aria-hidden="true" size={20} /><h2>벽과 바닥 꾸미기</h2>
            <IconButton label="벽과 바닥 설정 닫기" action="space_surfaces_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton>
          </div>
          <SurfaceControls atmosphere={room.atmosphere} surfaceTheme={surfaceTheme} onChange={changeAtmosphere}
            onStart={startAtmosphereGesture} onPreview={previewAtmosphere} onCommit={commitAtmosphereGesture} />
        </aside>}

        {!walking && canEdit && category === "atmosphere" && <aside className="space-studio__panel space-studio__atmosphere" aria-label="배경과 조명 설정">
          <div className="space-studio__panel-heading"><Sun aria-hidden="true" size={20} /><h2>빛과 색으로 채우는 방</h2>
            <IconButton label="분위기 설정 닫기" action="space_atmosphere_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton>
          </div>
          <p className="space-studio__panel-intro">바깥 하늘과 실내 조명을 미리 보고 저장해요.</p>
          <fieldset className="space-studio__atmosphere-section space-studio__outdoors"><legend>바깥 날씨와 시간</legend>
            <div className="space-studio__background-options space-studio__outdoor-modes">
              {Object.entries(OUTDOOR_MODES).map(([mode, label]) => <button key={mode} type="button" aria-pressed={outdoorMode === mode}
                data-ph-capture-attribute-action="space_outdoor_mode_change" onClick={() => selectOutdoorMode(mode)}>{label}</button>)}
            </div>
            {outdoorMode === "live" && <p className="space-studio__outdoor-status">
              {OUTDOOR_PHASES[live.phase]} · {live.status === "unavailable" ? "서울 시간 기준 · 날씨 정보 없음" :
                <>{OUTDOOR_WEATHER[live.weather]} · 서울{live.status === "stale" ? " (마지막 확인)" : ""} · <a href="https://open-meteo.com/" target="_blank"
                  rel="noreferrer" data-ph-capture-attribute-action="space_weather_source_open">Open-Meteo</a></>}
            </p>}
            {outdoorMode === "fixed" && <div className="space-studio__outdoor-selects">
              <label>고정할 시간<select value={fixedPhase} data-ph-capture-attribute-action="space_outdoor_time_change"
                onChange={(event) => changeAtmosphere({ outdoors: { ...outdoors, phase: event.target.value } })}>
                {Object.entries(OUTDOOR_PHASES).map(([phase, label]) => <option key={phase} value={phase}>{label}</option>)}
              </select></label>
              <label>고정할 날씨<select value={fixedWeather} data-ph-capture-attribute-action="space_outdoor_weather_change"
                onChange={(event) => changeAtmosphere({ outdoors: { ...outdoors, weather: event.target.value } })}>
                {Object.entries(OUTDOOR_WEATHER).map(([weather, label]) => <option key={weather} value={weather}>{label}</option>)}
              </select></label>
            </div>}
          </fieldset>
          {outdoorMode === "custom" && <><div className="space-studio__atmosphere-presets" aria-label="분위기 프리셋">
            {ATMOSPHERE_PRESETS.map((preset) => <button key={preset.id} type="button"
              aria-pressed={Object.entries(preset.values).every(([key, value]) => room.atmosphere[key] === value)}
              data-ph-capture-attribute-action="space_atmosphere_preset" onClick={() => changeAtmosphere(preset.values)}>
              <span style={{ "--preset-color": preset.values.backgroundColor }} aria-hidden="true" />{preset.name}
            </button>)}
          </div>
          <fieldset className="space-studio__atmosphere-section"><legend>방 바깥 배경</legend>
            <AtmosphereColor field="backgroundColor" label="배경 색상" value={room.atmosphere.backgroundColor}
              action="space_background_color_change" codeAction="space_background_color_code_change"
              onStart={startAtmosphereGesture} onPreview={previewAtmosphere} onCommit={commitAtmosphereGesture} />
            <div className="space-studio__background-options" aria-label="배경 표현">
              <button type="button" aria-pressed={room.atmosphere.backgroundStyle === "gradient"}
                data-ph-capture-attribute-action="space_background_gradient" onClick={() => changeAtmosphere({ backgroundStyle: "gradient" })}>그라데이션</button>
              <button type="button" aria-pressed={room.atmosphere.backgroundStyle === "solid"}
                data-ph-capture-attribute-action="space_background_solid" onClick={() => changeAtmosphere({ backgroundStyle: "solid" })}>단색</button>
            </div>
          </fieldset></>}
          <fieldset className="space-studio__atmosphere-section"><legend>빛과 그림자</legend>
            {ATMOSPHERE_RANGES.filter(({ field }) => outdoorMode === "custom" || field !== "sunAngle").map((range) => <AtmosphereRange key={range.field} {...range} value={room.atmosphere[range.field]}
              onStart={startAtmosphereGesture} onPreview={previewAtmosphere} onCommit={commitAtmosphereGesture} />)}
            <label className="space-studio__checkbox-field" htmlFor="space-atmosphere-shadows"><span>그림자 켜기</span>
              <input id="space-atmosphere-shadows" type="checkbox" checked={room.atmosphere.shadows}
                data-ph-capture-attribute-action="space_shadows_toggle" onChange={(event) => changeAtmosphere({ shadows: event.target.checked })} />
            </label>
          </fieldset>
          <SurfaceControls atmosphere={room.atmosphere} surfaceTheme={surfaceTheme} onChange={changeAtmosphere}
            onStart={startAtmosphereGesture} onPreview={previewAtmosphere} onCommit={commitAtmosphereGesture} />
          <button className="space-button space-studio__apply" type="button" data-ph-capture-attribute-action="space_atmosphere_reset"
            onClick={() => changeAtmosphere({ ...(TEMPLATE_ATMOSPHERES[room.template] || DEFAULT_ATMOSPHERE), outdoors: undefined })}>분위기 기본값으로</button>
          <small className="space-studio__panel-note">배경과 조명도 상단의 저장을 누르면 함께 남아요.</small>
        </aside>}

        {!walking && canEdit && selected?.kind === "memory" && !["clubhouse", "personal", "atmosphere"].includes(category) && (
          <aside className="space-studio__memory" aria-label="추억 액자 편집">
            <div className="space-studio__memory-heading"><Image aria-hidden="true" size={20} /><h2>우리의 기억 한 조각</h2>
              <IconButton label="추억 편집 닫기" action="space_memory_close" onClick={() => selectItem(null)}><X size={18} /></IconButton>
            </div>
            <label htmlFor="space-memory-title">추억 이름</label>
            <input id="space-memory-title" maxLength={40} value={selected.title || ""}
              data-ph-capture-attribute-action="space_memory_title_change" onChange={(event) => changeItem(selected.id, { title: event.target.value })} />
            <PhotoField shared={Boolean(groupContext)} id="space-memory-photo" label="추억 사진" photo={selected.photo} busy={photoBusy}
              uploadAction="space_memory_photo_choose" removeAction="space_memory_photo_remove"
              onChange={(file) => importPhoto(file, selected.id)}
              onRemove={() => { cancelPhotoRequest(); changeItem(selected.id, { photo: "" }); }} />
            <label htmlFor="space-memory-note">기억하고 싶은 이야기</label>
            <textarea id="space-memory-note" rows={4} maxLength={500} value={selected.note || ""}
              placeholder="함께 웃었던 날, 다시 만나고 싶은 순간…" data-ph-capture-attribute-action="space_memory_note_change"
              onChange={(event) => changeItem(selected.id, { note: event.target.value })} />
            <label htmlFor="space-memory-link">활동 기록 링크</label>
            <input id="space-memory-link" type="url" maxLength={500} value={selected.link || ""} placeholder="https://…"
              aria-invalid={Boolean(selected.link && !isSafeRecordLink(selected.link))}
              aria-describedby={selected.link && !isSafeRecordLink(selected.link) ? "space-link-error" : undefined}
              data-ph-capture-attribute-action="space_memory_link_change" onChange={(event) => changeItem(selected.id, { link: event.target.value })} />
            {selected.link && !isSafeRecordLink(selected.link) && <p id="space-link-error" className="space-studio__field-error">http:// 또는 https://로 시작하는 주소를 넣어 주세요.</p>}
            {selected.link && isSafeRecordLink(selected.link) && <a className="space-studio__record-link" href={selected.link}
              target="_blank" rel="noopener noreferrer" data-ph-capture-attribute-action="space_memory_record_open">
              활동 기록 열기<ExternalLink aria-hidden="true" size={16} /><span className="space-studio__sr-only">(새 창)</span></a>}
            {photoBusy && <p className="space-studio__photo-status" role="status">사진을 준비하고 있어요…</p>}
            <small>상단의 저장을 누르면 공간과 함께 남아요.</small>
          </aside>
        )}

        {!walking && !clubhouse && !canEdit && category === "memories" && <aside className="space-studio__panel" aria-label="우리 모임 추억">
          <div className="space-studio__panel-heading"><Image size={20} aria-hidden="true" /><h2>함께 남긴 추억</h2>
            <IconButton label="추억 보기 닫기" action="space_memory_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton></div>
          {room.items.filter((item) => item.kind === "memory").length === 0 && <p>아직 전시한 추억이 없어요.</p>}
          {room.items.filter((item) => item.kind === "memory").map((item) => <article className="space-studio__memory-card" key={item.id}>
            <h3>{item.title || "추억 액자"}</h3>{item.photo && <img src={item.photo} alt={item.title || "함께한 순간"} />}
            <p>{item.note}</p>{item.link && isSafeRecordLink(item.link) && <a href={item.link} target="_blank" rel="noopener noreferrer"
              data-ph-capture-attribute-action="space_memory_record_open">활동 기록 열기</a>}
          </article>)}
        </aside>}

        </div>
        </div>
        {clubhouse?.overlay}

        {notice && !templateSwitching && <div className={`space-studio__notice${noticeError ? " space-studio__notice--error" : ""}`} role={noticeError ? "alert" : "status"}>
          {!noticeError && <Check aria-hidden="true" size={17} />}<span>{notice}</span>
          {noticeError && <IconButton label="알림 닫기" action="space_notice_dismiss" onClick={() => setNotice("")}><X size={16} /></IconButton>}
        </div>}
      </section>

      {walking ? <footer className="space-studio__walk-dock" hidden={hudHidden || webPreview || walkInputBlocked || Boolean(clubhouse?.cameraFlight)}>
        {!playMode && <div className="space-studio__walk-help"><strong>우리 공간을 걸어 보세요</strong>
          <p>WASD 이동 · Shift + WASD 달리기 · Space 점프 · 화면 클릭으로 시선 조작 · Esc로 포인터 풀기 · 터치는 드래그</p>
          <small>가구를 바라보고 E · 숫자키로 자세나 행동 선택 · R로 소품 내려놓기</small>
        </div>}
        <div className="space-studio__walk-pad" role="toolbar" aria-label="걷기 조작">
          <IconButton className="space-studio__walk-forward" label="앞으로 걷기" action="space_walk_forward" onClick={() => commandWalk("forward")}><ArrowUp size={22} /></IconButton>
          <IconButton label="왼쪽으로 걷기" action="space_walk_left" onClick={() => commandWalk("left")}><ArrowLeft size={22} /></IconButton>
          <IconButton label="뒤로 걷기" action="space_walk_backward" onClick={() => commandWalk("backward")}><ArrowDown size={22} /></IconButton>
          <IconButton label="오른쪽으로 걷기" action="space_walk_right" onClick={() => commandWalk("right")}><ArrowRight size={22} /></IconButton>
          <IconButton className="space-studio__walk-jump" label="점프" action="space_walk_jump" onClick={() => commandWalk("jump")}><ArrowUpFromLine size={22} /></IconButton>
        </div>
        {!playMode && <div className="space-studio__look-pad" role="toolbar" aria-label="둘러보기 조작">
          <IconButton label="왼쪽 바라보기" action="space_walk_turn_left" onClick={() => commandWalk("turnLeft")}><RotateCcw size={22} /></IconButton>
          <IconButton label="오른쪽 바라보기" action="space_walk_turn_right" onClick={() => commandWalk("turnRight")}><RotateCw size={22} /></IconButton>
          <IconButton label="위 바라보기" action="space_walk_look_up" onClick={() => commandWalk("lookUp")}><ArrowUp size={22} /></IconButton>
          <IconButton label="아래 바라보기" action="space_walk_look_down" onClick={() => commandWalk("lookDown")}><ArrowDown size={22} /></IconButton>
        </div>}
      </footer> : canEdit && ["furniture", "surfaces", "memories"].includes(category) ? <footer className="space-studio__dock" hidden={hudHidden || webPreview || Boolean(clubhouse && !menuOpen)}>
        <div className="space-studio__dock-heading"><strong>{CATEGORIES.find((entry) => entry.id === category)?.label}</strong>
          <IconButton label="꾸미기 항목 닫기" action="space_catalog_close" onClick={() => selectCategory(null)}><X size={18} /></IconButton></div>
        {category === "furniture" && <div className="space-studio__asset-filters">
          <label className="space-studio__asset-search"><Search size={15} aria-hidden="true" />
            <input aria-label="가구와 시설 검색" placeholder="가구·시설 검색" value={assetSearch}
              data-ph-capture-attribute-action="space_asset_search" onChange={(event) => setAssetSearch(event.target.value)} />
          </label>
          <div role="group" aria-label="에셋 모음" className="space-studio__asset-collections">
            {[["all", "전체"], ["essentials", "공통 기능"], ["common", "가구·조명"], ["props", "상판·선반 소품"], ["architecture", "벽·천장 장식"], ["climbing", "클라이밍"], ["boardgame", "보드게임"],
              ["dining", "맛집"], ["band", "밴드"], ["study", "개발"], ["photo", "사진"]].map(([id, label]) =>
              <button key={id} type="button" aria-pressed={assetCollection === id}
                data-ph-capture-attribute-action="space_asset_collection" onClick={() => setAssetCollection(id)}>{label}</button>)}
          </div>
        </div>}
        <div className="space-studio__catalog" aria-label="꾸미기 항목">
          {category === "furniture" && <div className="space-studio__placement" role="group" aria-label="새 가구를 놓을 곳">
            <button type="button" aria-pressed={activePlacementArea === "building"} data-ph-capture-attribute-action="space_place_building"
              onClick={() => changePlacementArea("building")}>{hasMezzanine ? "1층에 놓기" : "실내에 놓기"}</button>
            {hasMezzanine && <button type="button" aria-pressed={activePlacementArea === "mezzanine"} data-ph-capture-attribute-action="space_place_mezzanine"
              onClick={() => changePlacementArea("mezzanine")}>중층에 놓기</button>}
            <button type="button" aria-pressed={activePlacementArea === "yard"} data-ph-capture-attribute-action="space_place_yard"
              onClick={() => changePlacementArea("yard")}>마당에 놓기</button>
          </div>}
          {(category === "furniture" || category === "memories") && CATALOG.filter((item) => item.category === category &&
            (category !== "furniture" || (assetCollection === "all" || (item.collection || "common") === assetCollection) &&
              item.name.includes(assetSearch.trim()))).map((item) => {
            const Icon = ITEM_ICONS[item.kind] || Box;
            return <button className="space-studio__item" key={item.kind} type="button" aria-label={`${item.name} 추가`}
              data-ph-capture-attribute-action="space_item_add" onClick={() => addItem(item.kind)}>
              {thumbnails[item.kind] ? <img src={thumbnails[item.kind]} alt="" draggable="false" /> : <Icon aria-hidden="true" size={38} strokeWidth={1.4} />}
              <span>{item.name}</span><Plus aria-hidden="true" className="space-studio__add-icon" size={14} />
            </button>;
          })}
          {category === "memories" && <p className="space-studio__catalog-note">사진과 후기를 골라 걸고,<br />액자를 눌러 다시 꺼내 보세요.</p>}
          {category === "surfaces" && THEMES.map((theme) => (
            <button className="space-studio__theme" type="button" key={theme.id} aria-pressed={room.theme === theme.id}
              data-ph-capture-attribute-action="space_theme_change" onClick={() => changeRoom({ ...room, theme: theme.id })}>
              <span className="space-studio__swatch" style={{ "--swatch-wall": theme.wall, "--swatch-floor": theme.floor }} />
              <span>{theme.name}</span>{room.theme === theme.id && <Check aria-hidden="true" size={15} />}
            </button>
          ))}
          {(category === "personal" || category === "clubhouse") && <div className="space-studio__room-summary">
            <span className={`space-studio__summary-icon space-studio__template--${room.template}`}>
              {room.template === "climbing" ? <Mountain aria-hidden="true" size={28} /> : room.template === "dining" ?
                <Utensils aria-hidden="true" size={28} /> : room.template === "band" ? <Music aria-hidden="true" size={28} /> : room.template === "boardgame" ? <Dices aria-hidden="true" size={28} /> : <Sofa aria-hidden="true" size={28} />}
            </span><div><strong>{template.name}</strong><p>{category === "clubhouse" ? "취미에 맞춘 구조와 기본 가구" : "이름과 사진으로 우리답게 꾸며요"}</p></div>
          </div>}
          {category === "atmosphere" && <div className="space-studio__room-summary">
            <span className="space-studio__summary-icon"><Sun aria-hidden="true" size={28} /></span>
            <div><strong>우리 방의 분위기</strong><p>배경·조명·벽과 바닥을 자유롭게</p></div>
          </div>}
        </div>
        <p className="space-studio__hint"><MousePointer2 aria-hidden="true" size={19} /><span>골라서 놓고,<br />테마를 섞어 꾸며요</span></p>
      </footer> : null}
      {templateSwitching && <div className="space-studio__template-progress">
        <div role="status"><span className="ui-spinner" aria-hidden="true" />아지트를 준비하고 있어요…</div>
      </div>}
    </Root>
  );
}
