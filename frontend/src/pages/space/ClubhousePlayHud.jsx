import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Camera, CircleHelp, Eye, Image, Lightbulb, LightbulbOff, Megaphone, Menu, MessageCircle, Music, Paintbrush, Volume2, VolumeX
} from "lucide-react";
import { Modal } from "../../shared/ui/Overlay.jsx";
import { ROOM_LIGHT_TOGGLE_ACTION } from "./clubhouseInteractions.js";
import "./clubhouse-play-hud.css";

const INTRO_DURATION_MS = 7000;
const INTRO_SEEN_KEY = "clubhouse-play-controls-seen";
let introSeen = false;

function hasSeenIntro() {
  try {
    return introSeen || window.sessionStorage.getItem(INTRO_SEEN_KEY) === "true";
  } catch {
    return introSeen;
  }
}

function IntroHelp() {
  const [visible, setVisible] = useState(() => !hasSeenIntro());

  useEffect(() => {
    if (!visible) return;
    introSeen = true;
    try {
      window.sessionStorage.setItem(INTRO_SEEN_KEY, "true");
    } catch {
      // The in-memory flag still prevents repeated hints when storage is unavailable.
    }
    const timeout = window.setTimeout(() => setVisible(false), INTRO_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  return <div className="clubhouse-play-hud__intro" role="status">
    {visible && <div className="clubhouse-play-hud__intro-card">
      <strong>아지트를 둘러보세요</strong>
      <span className="clubhouse-play-hud__keyboard-copy">WASD로 이동 · 마우스로 둘러보기 · E로 상호작용</span>
      <span className="clubhouse-play-hud__touch-copy">방향 버튼으로 이동 · 화면을 밀어 둘러보기</span>
    </div>}
  </div>;
}

export default function ClubhousePlayHud({
  view, onViewChange, onOpenFeature, canChat, unreadCount, onDecorate,
  muted, onToggleMuted, generalLighting, onToggleLighting, inputBlocked, onOverlayChange, ready = true
}) {
  const [overlay, setOverlay] = useState(null);
  const menuId = useId();
  const settingsId = useId();
  const menuButton = useRef(null);
  const settingsButton = useRef(null);
  const menuOpen = overlay === "menu";
  const settingsOpen = overlay === "settings";
  const overlayOpen = overlay !== null;
  const hasUnread = unreadCount > 0;

  useLayoutEffect(() => {
    if (!overlayOpen) return;
    onOverlayChange?.(true);
    return () => onOverlayChange?.(false);
  }, [onOverlayChange, overlayOpen]);

  useEffect(() => {
    if (!menuOpen && !settingsOpen) return;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOverlay(null);
      (menuOpen ? menuButton : settingsButton).current?.focus();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [menuOpen, settingsOpen]);

  function openFeature(feature) {
    menuButton.current?.focus();
    setOverlay(null);
    onOpenFeature(feature);
  }

  function changeView(nextView) {
    settingsButton.current?.focus();
    setOverlay(null);
    onViewChange(nextView);
  }

  return <div className="clubhouse-play-hud">
    {(menuOpen || settingsOpen) && <div className="clubhouse-play-hud__dismiss-layer" role="presentation"
      onClick={() => setOverlay(null)} onPointerDown={(event) => event.preventDefault()} />}

    {onDecorate && <button type="button" className="space-button clubhouse-play-hud__decorate"
      data-ph-capture-attribute-action="space_mode_edit" onClick={onDecorate}>
      <Paintbrush size={18} aria-hidden="true" />꾸미기
    </button>}

    <div className={`space-studio__editor-menu clubhouse-play-hud__menu${menuOpen ? " space-studio__editor-menu--open" : ""}`}>
      <button ref={menuButton} type="button" className="space-studio__menu-toggle space-studio__editor-menu-toggle"
        aria-expanded={menuOpen} aria-controls={menuId} data-ph-capture-attribute-action="group_playbar_toggle"
        aria-label={menuOpen ? "메뉴 접기" : "메뉴 펼치기"} title={menuOpen ? "메뉴 접기" : "메뉴 펼치기"}
        onClick={() => setOverlay(menuOpen ? null : "menu")}>
        <Menu size={22} aria-hidden="true" /><span>메뉴</span>
      </button>
      <nav className="space-studio__rail" id={menuId} aria-label="아지트 메뉴" aria-hidden={!menuOpen || undefined} inert={!menuOpen}>
        <button type="button" aria-label="공지사항" title="공지사항" aria-haspopup="dialog" data-ph-capture-attribute-action="group_dashboard_open" onClick={() => openFeature("dashboard")}>
          <Megaphone size={22} aria-hidden="true" /><span>공지</span>
        </button>
        <button type="button" aria-label="활동 기록" title="활동 기록" aria-haspopup="dialog" data-ph-capture-attribute-action="group_activities_open" onClick={() => openFeature("activities")}>
          <Image size={22} aria-hidden="true" /><span>활동</span>
        </button>
        <button type="button" aria-label="재생목록" title="재생목록" data-ph-capture-attribute-action="space_music_open" onClick={() => openFeature("music")}>
          <Music size={22} aria-hidden="true" /><span>목록</span>
        </button>
      </nav>
    </div>

    <div className="space-studio__view-tools clubhouse-play-hud__view-tools">
      <button ref={settingsButton} type="button" className="space-studio__view-toggle" aria-expanded={settingsOpen}
        aria-label="시점 설정" title="시점 설정" aria-controls={settingsId} data-ph-capture-attribute-action="space_play_settings_toggle"
        onClick={() => setOverlay(settingsOpen ? null : "settings")}>
        <Camera size={22} aria-hidden="true" /><span>시점</span>
      </button>
      <div className="space-studio__view-content clubhouse-play-hud__settings" id={settingsId} role="group" aria-label="시점 설정" hidden={!settingsOpen}>
        <button type="button" className="space-studio__view-toggle" aria-pressed={view === "firstPerson"}
          data-ph-capture-attribute-action="space_mode_first_person" onClick={() => changeView("firstPerson")}>
          <Eye size={22} aria-hidden="true" /><span>1인칭</span>
        </button>
        <button type="button" className="space-studio__view-toggle" aria-pressed={view === "thirdPerson"}
          data-ph-capture-attribute-action="space_mode_third_person" onClick={() => changeView("thirdPerson")}>
          <Camera size={22} aria-hidden="true" /><span>3인칭</span>
        </button>
        {onToggleLighting && <button type="button" className="space-studio__view-toggle" aria-label="전체 조명" aria-pressed={generalLighting}
          title={generalLighting ? "전체 조명 끄기" : "전체 조명 켜기"}
          data-ph-capture-attribute-action={ROOM_LIGHT_TOGGLE_ACTION} onClick={onToggleLighting}>
          {generalLighting ? <Lightbulb size={22} aria-hidden="true" /> : <LightbulbOff size={22} aria-hidden="true" />}
          <span>조명</span>
        </button>}
      </div>
      {onToggleMuted && <button type="button" className="space-studio__edge-button" aria-label="모임 음악 음소거"
        title={muted ? "소리 켜기" : "소리 끄기"}
        aria-pressed={muted} data-ph-capture-attribute-action="group_music_mute" onClick={onToggleMuted}>
        {muted ? <VolumeX size={22} aria-hidden="true" /> : <Volume2 size={22} aria-hidden="true" />}
        <span>소리</span>
      </button>}
      <button type="button" className="space-studio__edge-button" aria-label="조작 도움말" title="조작 도움말"
        aria-haspopup="dialog" data-ph-capture-attribute-action="space_play_help_open" onClick={() => setOverlay("help")}>
        <CircleHelp size={22} aria-hidden="true" /><span>도움말</span>
      </button>
    </div>

    {canChat && <div className="clubhouse-play-hud__group clubhouse-play-hud__chat">
      <button type="button" aria-haspopup="dialog" aria-label={hasUnread ? `채팅, 읽지 않은 메시지 ${unreadCount}개` : "채팅"}
        data-ph-capture-attribute-action="group_chat_open" onClick={() => onOpenFeature("chat")}>
        <MessageCircle size={19} aria-hidden="true" />채팅
        {hasUnread && <span className="clubhouse-play-hud__unread" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
    </div>}

    {ready && !inputBlocked && !overlayOpen && <IntroHelp />}

    <Modal panelClassName="clubhouse-play-help-dialog" open={overlay === "help"} onClose={() => setOverlay(null)} title="조작 도움말" closeAction="space_play_help_close"
      description="1인칭과 3인칭 모두 같은 조작으로 아지트를 둘러볼 수 있어요.">
      <dl className="clubhouse-play-help">
        <dt>이동</dt><dd><span className="clubhouse-play-hud__keyboard-copy">WASD로 걷기 · Shift를 누른 채 달리기 · Space로 점프</span><span className="clubhouse-play-hud__touch-copy">방향 버튼으로 걷고 점프 버튼을 눌러요.</span></dd>
        <dt>둘러보기</dt><dd><span className="clubhouse-play-hud__keyboard-copy">마우스를 움직여요. Esc로 포인터를 풀고, Enter를 누르면 다시 둘러볼 수 있어요.</span><span className="clubhouse-play-hud__touch-copy">공간 화면을 밀어 시선을 돌려요.</span></dd>
        <dt>상호작용</dt><dd><span className="clubhouse-play-hud__keyboard-copy">대상 가까이에서 바라보고 E · 숫자키로 행동 선택 · R로 소품 내려놓기</span><span className="clubhouse-play-hud__touch-copy">가까이에서 대상을 바라보고 화면에 나타나는 행동을 눌러요.</span></dd>
        <dt>손에 든 물건</dt><dd><span className="clubhouse-play-hud__keyboard-copy">마우스 왼쪽 클릭으로 먹기 · 마시기 · 사진 찍기. 화면의 좌클릭 안내도 누를 수 있어요.</span><span className="clubhouse-play-hud__touch-copy">화면에 나타나는 먹기 · 마시기 · 사진 찍기 버튼을 눌러요.</span></dd>
      </dl>
    </Modal>
  </div>;
}
