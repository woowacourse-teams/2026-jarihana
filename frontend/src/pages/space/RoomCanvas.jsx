import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { activeSpeechMessages } from "./clubhouseInteractions";
import "./room-canvas-play.css";

const PREVIEW_CONTROLS = "화면을 클릭한 뒤 W/S로 전진·후진, A/D로 좌우 이동, Q/E로 하강·상승할 수 있어요. 마우스 드래그로 방향을 돌리고 Home 키로 처음 구도로 돌아갈 수 있어요.";
const PLAY_FEATURE_LABELS = { dashboard: "공지 보기", activities: "활동 사진 보기", music: "재생목록 보기" };

export function RoomCanvas({ room, signName, selectedId, onSelect, onMove, onInvalid, view, zoom, onThumbnails, onTemplateTransition, onZoomChange, cameraReset = 0,
  visitPointerLockRef, walkCommand, onExitWalk, onWalkPosition, floorView = "all", editable = true, focusBuilding = false, interactive = true, speechMessages, greetingMembers, cameraFlight, activityExhibit, outdoorLight, generalLighting = true, previewExterior = true, previewWideAngle = 0,
  avatarAppearance, playMode = false, walkInputBlocked = false, preserveWalkPose = false, studioWideAngle = 0, studioCameraTurn, onStatusChange, realtime, realtimeStatus, onCapture, onSharedLighting }) {
  const host = useRef(null);
  const scene = useRef(null);
  const interactionMenu = useRef(null);
  const callbacks = useRef({ onSelect, onMove, onInvalid, onExitWalk, onWalkPosition, onZoomChange, onTemplateTransition, editable, focusBuilding, interactive, previewExterior, signName, playMode, walkInputBlocked, preserveWalkPose, onCapture, onSharedLighting });
  const current = useRef({ room, selectedId, view, zoom, floorView, cameraReset, activityExhibit });
  const currentAvatarAppearance = useRef(avatarAppearance);
  const currentOutdoorLight = useRef(outdoorLight);
  const currentGeneralLighting = useRef(generalLighting);
  const currentWideAngle = useRef(previewWideAngle);
  const currentStudioWideAngle = useRef(studioWideAngle);
  const lastStudioTurn = useRef(null);
  const lastCommand = useRef(null);
  const generatedThumbnails = useRef(false);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [interaction, setInteraction] = useState(null);
  const [lookMode, setLookMode] = useState("free");
  const hasMouseLook = lookMode === "locked" || lookMode === "hover";
  const menu = interaction?.menu;
  const choices = menu?.choices || interaction?.poseChoices;
  const exterior = view === "exterior";
  const preview = view === "front";
  const walking = interactive && (view === "firstPerson" || view === "thirdPerson");
  const walkingReady = walking && status === "ready" && !walkInputBlocked;

  useImperativeHandle(visitPointerLockRef, () => () => {
    if (status === "ready") scene.current?.requestVisitPointerLock();
  }, [status]);

  useLayoutEffect(() => { callbacks.current = { onSelect, onMove, onInvalid, onExitWalk, onWalkPosition, onZoomChange, onTemplateTransition, editable, focusBuilding, interactive, previewExterior, signName, playMode, walkInputBlocked, preserveWalkPose, onCapture, onSharedLighting }; },
    [onSelect, onMove, onInvalid, onExitWalk, onWalkPosition, onZoomChange, onTemplateTransition, editable, focusBuilding, interactive, previewExterior, signName, playMode, walkInputBlocked, preserveWalkPose, onCapture, onSharedLighting]);
  useLayoutEffect(() => {
    scene.current?.setWalkInputBlocked?.(walkInputBlocked);
  }, [walkInputBlocked]);
  useLayoutEffect(() => {
    current.current = { room, selectedId, view, zoom, floorView, cameraReset, activityExhibit };
    scene.current?.setActivityExhibit?.(activityExhibit);
    scene.current?.update(room, selectedId, view, zoom, floorView, cameraReset, ...(cameraFlight ? [cameraFlight] : []));
  }, [room, selectedId, view, zoom, floorView, cameraReset, focusBuilding, interactive, cameraFlight, activityExhibit, previewExterior, signName, playMode, preserveWalkPose]);

  useLayoutEffect(() => {
    currentAvatarAppearance.current = avatarAppearance;
    scene.current?.setPlayerAppearance?.(avatarAppearance);
  }, [avatarAppearance]);

  useLayoutEffect(() => {
    currentOutdoorLight.current = outdoorLight;
    scene.current?.setOutdoorLight?.(outdoorLight);
  }, [outdoorLight]);

  useLayoutEffect(() => {
    currentGeneralLighting.current = generalLighting;
    scene.current?.setGeneralLighting?.(generalLighting);
  }, [generalLighting]);

  useLayoutEffect(() => {
    currentWideAngle.current = previewWideAngle;
    scene.current?.setPreviewWideAngle?.(previewWideAngle);
  }, [previewWideAngle]);

  useLayoutEffect(() => {
    currentStudioWideAngle.current = studioWideAngle;
    scene.current?.setStudioWideAngle?.(studioWideAngle);
  }, [studioWideAngle]);

  useLayoutEffect(() => {
    if (walkingReady && menu && lookMode !== "hover" && document.pointerLockElement !== host.current) {
      interactionMenu.current?.querySelector("button[aria-keyshortcuts='1']")?.focus({ preventScroll: true });
    }
  }, [menu, walkingReady, lookMode]);

  function interactionCommand(action) {
    host.current?.focus({ preventScroll: true });
    scene.current?.command(action);
  }

  function chooseInteraction(selection) {
    scene.current?.chooseWalkInteraction?.(selection);
    host.current?.focus({ preventScroll: true });
  }

  function interactionKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = event.code === "KeyE" ? "interact" : event.code === "KeyR" && interaction.held ? "putAway" :
      event.key === "Escape" && menu ? "cancelInteraction" : null;
    if (action || (/^[1-9]$/.test(event.key) && Number(event.key) <= choices?.length)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (action) interactionCommand(action);
      else chooseInteraction(Number(event.key) - 1);
    } else if (menu && ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)) {
      const buttons = [...interactionMenu.current.querySelectorAll(".space-studio__interaction-choices button")];
      const index = buttons.indexOf(event.currentTarget);
      if (index < 0) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + direction + buttons.length) % buttons.length].focus();
    }
  }

  useEffect(() => {
    if (walking && status === "ready" && !callbacks.current.walkInputBlocked) host.current?.focus({ preventScroll: true });
  }, [walking, view, status]);

  useEffect(() => { onStatusChange?.(status); }, [onStatusChange, status]);
  useEffect(() => { if (status === "ready") scene.current?.setRealtime?.(realtime); }, [realtime, status]);

  useEffect(() => {
    if (status !== "ready" || !studioCameraTurn || lastStudioTurn.current === studioCameraTurn.id) return;
    lastStudioTurn.current = studioCameraTurn.id;
    scene.current?.turnStudioCamera?.(studioCameraTurn.direction);
  }, [studioCameraTurn, status]);

  useEffect(() => {
    if (status !== "ready") return undefined;
    let timer;
    function refreshSpeech() {
      const messages = activeSpeechMessages(speechMessages);
      scene.current?.setSpeech?.(messages);
      if (messages.length) timer = window.setTimeout(refreshSpeech,
        Math.max(1, Math.min(...messages.map((message) => message.expiresAt)) - Date.now()));
    }
    refreshSpeech();
    return () => window.clearTimeout(timer);
  }, [speechMessages, status]);

  useEffect(() => {
    if (status === "ready") scene.current?.setGreetingMembers?.(greetingMembers);
  }, [greetingMembers, status]);

  useEffect(() => {
    if (!walkCommand || lastCommand.current === walkCommand.id) return;
    if (!walkInputBlocked && (!walking || status !== "ready")) return;
    lastCommand.current = walkCommand.id;
    if (walkInputBlocked) return;
    scene.current?.command(walkCommand.action);
    host.current?.focus({ preventScroll: true });
  }, [walkCommand, walking, status, walkInputBlocked]);

  useEffect(() => {
    let cancelled = false;
    let runtime;
    import("./roomScene").then(({ createRoomScene }) => {
      if (cancelled) return;
      runtime = createRoomScene(host.current, {
        canInteract: () => callbacks.current.interactive,
        canEdit: () => callbacks.current.editable,
        preserveWalkPose: () => callbacks.current.preserveWalkPose,
        isPlayMode: () => callbacks.current.playMode,
        focusBuilding: () => callbacks.current.focusBuilding,
        showPreviewExterior: () => callbacks.current.previewExterior,
        getSignName: () => callbacks.current.signName,
        onSelect: (id) => callbacks.current.onSelect(id),
        onMove: (...values) => callbacks.current.onMove(...values),
        onInvalid: () => callbacks.current.onInvalid(),
        onWalkInteraction: setInteraction,
        onCapture: (file) => callbacks.current.onCapture?.(file),
        onSharedLighting: (enabled) => callbacks.current.onSharedLighting?.(enabled),
        onWalkPointerLock: setLookMode,
        onWalkPosition: (position) => callbacks.current.onWalkPosition?.(position),
        onExitWalk: () => callbacks.current.onExitWalk?.(),
        onZoomChange: (value) => callbacks.current.onZoomChange?.(value),
        onTemplateTransition: callbacks.current.onTemplateTransition && ((pending) => callbacks.current.onTemplateTransition?.(pending)),
        onError: () => setStatus("error")
      });
      scene.current = runtime;
      const state = current.current;
      runtime.setActivityExhibit?.(state.activityExhibit);
      runtime.setPlayerAppearance?.(currentAvatarAppearance.current);
      runtime.setOutdoorLight?.(currentOutdoorLight.current);
      runtime.setGeneralLighting?.(currentGeneralLighting.current);
      runtime.setPreviewWideAngle?.(currentWideAngle.current);
      runtime.setStudioWideAngle?.(currentStudioWideAngle.current);
      runtime.setWalkInputBlocked?.(callbacks.current.walkInputBlocked);
      runtime.update(state.room, state.selectedId, state.view, state.zoom, state.floorView, state.cameraReset);
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; runtime?.dispose(); scene.current = null; };
  }, [attempt]);

  useEffect(() => {
    if (status !== "ready" || !onThumbnails || generatedThumbnails.current) return undefined;
    const controller = new AbortController();
    import("./roomScene").then(async ({ createFurnitureThumbnails }) => {
      if (controller.signal.aborted) return;
      const thumbnails = await createFurnitureThumbnails(controller.signal);
      if (controller.signal.aborted) return;
      generatedThumbnails.current = true;
      onThumbnails(thumbnails);
    }).catch(() => { /* Catalog icons remain usable without GPU previews. */ });
    return () => controller.abort();
  }, [onThumbnails, status]);

  return (
    <>
      {/* WebGL is a custom keyboard surface; the equivalent native controls are in the furniture toolbar. */}
      <div className="room-canvas" ref={host} data-canvas-status={status}
        data-mouse-look={playMode && walkingReady && hasMouseLook ? "active" : undefined}
        role={interactive ? "application" : "img"} tabIndex={interactive ? 0 : cameraFlight && view === "firstPerson" ? -1 : undefined}
        aria-roledescription={!interactive ? "3D 공간 미리보기" : walking || !editable ? "3D 공간 둘러보기" : "3D 공간 편집기"}
        title={preview && interactive ? PREVIEW_CONTROLS : undefined}
        aria-label={!interactive ? "모임 아지트 미리보기." : preview ? `모임 아지트 미리보기. ${PREVIEW_CONTROLS}` : walking ? "모임 공간 둘러보기. WASD로 이동, Shift와 함께 누르면 달리기, Space로 점프하세요. E로 앉기, 일어서기 또는 가까운 물건 사용, 숫자키로 자세나 행동 선택, R로 소품 내려놓기. Esc로 포인터를 풀고, 화면을 클릭하거나 Enter를 누르면 시선 조작을 시작해요. 터치 화면에서는 드래그하세요." :
          editable ? "모임 공간. 빈 공간 드래그로 회전, 우클릭 또는 Shift와 드래그로 화면 이동, 휠로 확대·축소하세요. 가구는 드래그하거나 목록에서 선택한 뒤 방향키로 이동하세요. Escape는 선택 해제입니다." : "모임 공간 둘러보기. 드래그로 회전, 우클릭 또는 Shift와 드래그로 화면 이동, 휠로 확대·축소하세요. 추억 액자를 눌러 읽거나 1인칭과 3인칭으로 걸어 보세요."}
        data-ph-capture-attribute-action={interactive ? walking ? "space_walk_look" : "space_object_select" : undefined}
        onKeyDown={interactive && !preview ? (event) => {
          if (walking) return;
          if (exterior) {
            if (event.key === "Escape") { event.preventDefault(); onExitWalk?.(); }
            return;
          }
          if (event.key === "Escape") { onSelect(null); return; }
          if (!editable) return;
          const offsets = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.25], ArrowDown: [0, 0.25] };
          const offset = offsets[event.key];
          const selected = room.items.find((item) => item.id === selectedId);
          if (offset && selected) { event.preventDefault(); onMove(selected.id, selected.x + offset[0], selected.z + offset[1]); }
        } : undefined} />
      {walkingReady && playMode && view === "firstPerson" && !menu && (
        <span className="room-canvas__reticle" data-aimed={Boolean(interaction?.target)} aria-hidden="true" />
      )}
      {walkingReady && !menu && (!playMode || !hasMouseLook) && (
        <div className="space-studio__look-mode">
          {hasMouseLook ? <span role="status"><kbd>Esc</kbd> 시선 조작 끄기</span> : lookMode === "drag" && !playMode ? (
            <span role="status">드래그로 시선 조작</span>
          ) : (
            <button type="button" data-ph-capture-attribute-action="space_walk_lock_pointer"
              onClick={() => scene.current?.command("lockPointer")}>{playMode ? "마우스로 둘러보기" : "시선 조작 시작"}</button>
          )}
        </div>
      )}
      {walkingReady && (interaction?.target || choices || interaction?.held || interaction?.feedback) && (
        <div className={`space-studio__interaction${playMode ? " room-canvas__play-interaction" : ""}`}>
          {!menu && interaction.target && (
            <button type="button" className="space-studio__interaction-prompt" aria-keyshortcuts="E"
              data-ph-capture-attribute-action={interaction.target.action || "space_walk_interact"}
              onKeyDown={interactionKey} onClick={() => interactionCommand("interact")}>
              <kbd>E</kbd>{(playMode && PLAY_FEATURE_LABELS[interaction.target.feature]) || interaction.target.label}
            </button>
          )}
          {choices && (
            <div className={menu ? "space-studio__interaction-menu" : "space-studio__interaction-poses"} role="group"
              aria-label={menu?.target.label || "앉은 자세"} ref={menu ? interactionMenu : undefined}>
              <div className="space-studio__interaction-choices">
                {choices.map((choice, index) => (
                  <button type="button" key={choice.id} data-ph-capture-attribute-action={choice.action}
                    aria-keyshortcuts={String(index + 1)} onKeyDown={interactionKey} onClick={() => chooseInteraction(choice.id)}>
                    <kbd>{index + 1}</kbd>
                    {choice.color && <span className="space-studio__flower-swatch" style={{ background: choice.color }} aria-hidden="true" />}
                    <span>{choice.label}</span>
                  </button>
                ))}
                {menu && <button type="button" data-ph-capture-attribute-action="space_walk_interact_cancel"
                  aria-keyshortcuts="E Escape" onKeyDown={interactionKey} onClick={() => interactionCommand("interact")}><kbd>E</kbd>닫기</button>}
              </div>
            </div>
          )}
          {interaction.held && (
            <button type="button" className="space-studio__interaction-prompt" aria-keyshortcuts="R"
              data-ph-capture-attribute-action="space_item_put_away" onKeyDown={interactionKey} onClick={() => interactionCommand("putAway")}>
              <kbd>R</kbd>내려놓기
            </button>
          )}
          {interaction.feedback && <span className="space-studio__interaction-feedback" role="status">{interaction.feedback}</span>}
        </div>
      )}
      {walkingReady && realtime && <div className="room-canvas__shared-tools">
        <span role="status">{realtimeStatus?.status === "connected" ? "함께 있는 아지트" : realtimeStatus?.error?.message || "아지트에 연결하는 중…"}</span>
        <button type="button" data-ph-capture-attribute-action="space_member_greet" onClick={() => interactionCommand("greet")}>인사 H</button>
        {interaction?.throwable && <button type="button" data-ph-capture-attribute-action="space_item_throw" onClick={() => interactionCommand("throw")}>던지기 G</button>}
        {interaction?.consumable && <button type="button" data-ph-capture-attribute-action="space_item_consume" onClick={() => interactionCommand("consume")}>먹기 · 마시기</button>}
        {interaction?.camera && <button type="button" data-ph-capture-attribute-action="space_camera_capture" onClick={() => interactionCommand("capture")}>사진 찍기</button>}
      </div>}
      {status === "loading" && <div className="space-studio__scene-state" role="status">우리 공간을 펼치는 중…</div>}
      {status === "error" && (
        <div className="space-studio__scene-state" role="alert">
          <strong>3D 공간을 표시하지 못했어요.</strong>
          <p>브라우저의 그래픽 가속을 확인해 주세요. 편집 내용은 그대로 남아 있어요.</p>
          <button type="button" data-ph-capture-attribute-action="space_scene_retry" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>다시 불러오기</button>
        </div>
      )}
    </>
  );
}
