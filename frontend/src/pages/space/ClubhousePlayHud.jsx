import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  CircleHelp, Ellipsis, Hand, Image, Lightbulb, LightbulbOff, Megaphone, MessageCircle, Music, Paintbrush, Volume2, VolumeX
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
  view, onViewChange, onOpenFeature, canChat, unreadCount, canGreet, greetingBusy, onGreet, onDecorate,
  muted, onToggleMuted, generalLighting, onToggleLighting, inputBlocked, onOverlayChange, ready = true
}) {
  const [overlay, setOverlay] = useState(null);
  const menuId = useId();
  const moreButton = useRef(null);
  const menuOpen = overlay === "menu";
  const overlayOpen = overlay !== null;
  const hasUnread = unreadCount > 0;

  useLayoutEffect(() => {
    if (!overlayOpen) return;
    onOverlayChange?.(true);
    return () => onOverlayChange?.(false);
  }, [onOverlayChange, overlayOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOverlay(null);
      moreButton.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [menuOpen]);

  function openFeature(feature) {
    moreButton.current?.focus();
    setOverlay(null);
    onOpenFeature(feature);
  }

  function changeView(nextView) {
    setOverlay(null);
    onViewChange(nextView);
  }

  return <div className="clubhouse-play-hud">
    {menuOpen && <div className="clubhouse-play-hud__dismiss-layer" role="presentation"
      onClick={() => setOverlay(null)} onPointerDown={(event) => event.preventDefault()} />}

    <div className="clubhouse-play-hud__view-tools">
      <div className="clubhouse-play-hud__group" role="group" aria-label="시점과 아지트 메뉴">
        <div className="clubhouse-play-hud__perspectives" role="group" aria-label="시점 전환">
          <button type="button" aria-pressed={view === "firstPerson"} data-ph-capture-attribute-action="space_mode_first_person"
            onClick={() => changeView("firstPerson")}>1인칭</button>
          <button type="button" aria-pressed={view === "thirdPerson"} data-ph-capture-attribute-action="space_mode_third_person"
            onClick={() => changeView("thirdPerson")}>3인칭</button>
        </div>
        {onToggleMuted && <button type="button" className="clubhouse-play-hud__icon-button" aria-label="모임 음악 음소거"
          aria-pressed={muted} title={muted ? "소리 켜기" : "소리 끄기"} data-ph-capture-attribute-action="group_music_mute" onClick={onToggleMuted}>
          {muted ? <VolumeX size={19} aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}
        </button>}
        <button ref={moreButton} type="button" className="clubhouse-play-hud__icon-button" aria-label="더보기" title="더보기"
          aria-expanded={menuOpen} aria-controls={menuId} data-ph-capture-attribute-action="group_playbar_toggle"
          onClick={() => setOverlay(menuOpen ? null : "menu")}><Ellipsis size={21} aria-hidden="true" /></button>
      </div>

      <div className="clubhouse-play-hud__group clubhouse-play-hud__more" id={menuId} role="group" aria-label="아지트 더보기" hidden={!menuOpen}>
        <button type="button" aria-haspopup="dialog" data-ph-capture-attribute-action="group_dashboard_open" onClick={() => openFeature("dashboard")}>
          <Megaphone size={18} aria-hidden="true" />공지사항
        </button>
        <button type="button" aria-haspopup="dialog" data-ph-capture-attribute-action="group_activities_open" onClick={() => openFeature("activities")}>
          <Image size={18} aria-hidden="true" />활동 기록
        </button>
        <button type="button" data-ph-capture-attribute-action="space_music_open" onClick={() => openFeature("music")}>
          <Music size={18} aria-hidden="true" />재생목록
        </button>
        {onToggleLighting && <button type="button" aria-pressed={generalLighting} data-ph-capture-attribute-action={ROOM_LIGHT_TOGGLE_ACTION} onClick={onToggleLighting}>
          {generalLighting ? <Lightbulb size={18} aria-hidden="true" /> : <LightbulbOff size={18} aria-hidden="true" />}
          전체 조명 <small aria-hidden="true">{generalLighting ? "켜짐" : "꺼짐"}</small>
        </button>}
        <button type="button" aria-haspopup="dialog" data-ph-capture-attribute-action="space_play_help_open" onClick={() => {
          moreButton.current?.focus();
          setOverlay("help");
        }}><CircleHelp size={18} aria-hidden="true" />조작 도움말</button>
      </div>
    </div>

    {canChat && <div className="clubhouse-play-hud__group clubhouse-play-hud__chat">
      <button type="button" aria-haspopup="dialog" aria-label={hasUnread ? `채팅, 읽지 않은 메시지 ${unreadCount}개` : "채팅"}
        data-ph-capture-attribute-action="group_chat_open" onClick={() => onOpenFeature("chat")}>
        <MessageCircle size={19} aria-hidden="true" />채팅
        {hasUnread && <span className="clubhouse-play-hud__unread" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
    </div>}

    {(canGreet || onDecorate) && <div className="clubhouse-play-hud__group clubhouse-play-hud__actions" role="group" aria-label="아지트 행동">
      {canGreet && <button type="button" disabled={greetingBusy} data-ph-capture-attribute-action="group_greeting_send" onClick={onGreet}>
        <Hand size={19} aria-hidden="true" />인사
      </button>}
      {onDecorate && <button type="button" className="clubhouse-play-hud__decorate" data-ph-capture-attribute-action="space_mode_edit" onClick={onDecorate}>
        <Paintbrush size={18} aria-hidden="true" />꾸미기
      </button>}
    </div>}

    {ready && !inputBlocked && !overlayOpen && <IntroHelp />}

    <Modal open={overlay === "help"} onClose={() => setOverlay(null)} title="조작 도움말" closeAction="space_play_help_close"
      description="1인칭과 3인칭 모두 같은 조작으로 아지트를 둘러볼 수 있어요.">
      <dl className="clubhouse-play-help">
        <dt>이동</dt><dd><span className="clubhouse-play-hud__keyboard-copy">WASD로 걷기 · Shift를 누른 채 달리기 · Space로 점프</span><span className="clubhouse-play-hud__touch-copy">방향 버튼으로 걷고 점프 버튼을 눌러요.</span></dd>
        <dt>둘러보기</dt><dd><span className="clubhouse-play-hud__keyboard-copy">마우스를 움직여요. Esc로 포인터를 풀고, 공간을 클릭하면 다시 둘러볼 수 있어요.</span><span className="clubhouse-play-hud__touch-copy">공간 화면을 밀어 시선을 돌려요.</span></dd>
        <dt>상호작용</dt><dd><span className="clubhouse-play-hud__keyboard-copy">대상 가까이에서 바라보고 E · 숫자키로 행동 선택 · R로 소품 내려놓기</span><span className="clubhouse-play-hud__touch-copy">가까이에서 대상을 바라보고 화면에 나타나는 행동을 눌러요.</span></dd>
      </dl>
    </Modal>
  </div>;
}
