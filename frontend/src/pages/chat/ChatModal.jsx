import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../features/auth";
import { useChatSession } from "../../features/chat/ChatSessionProvider";
import { Modal } from "../../shared/ui";
import "./chat-modal.css";

const ChatContent = lazy(() => import("./ChatPage.jsx").then((module) => ({ default: module.ChatContent })));

export function ChatModal() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const selected = search.get("chat");
  const open = Boolean(selected) && auth.status === "authenticated" && !auth.logoutPending;
  const selectRoom = useChatSession()?.selectRoom;
  const activeRoomId = open && selected !== "inbox" ? selected : undefined;
  useLayoutEffect(() => {
    selectRoom?.(activeRoomId);
    return () => selectRoom?.(undefined);
  }, [activeRoomId, selectRoom]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return undefined;
    const overlay = document.querySelector(".ui-overlay:has(> .chat-modal)");
    if (!overlay) return undefined;
    let frame = null;
    let blurFrame = null;
    let closingKeyboard = false;
    let previousTop;
    let previousHeight;
    let touchTarget = null;
    function isEditor(element) {
      return element instanceof Element && element.matches('input, textarea, [contenteditable="true"]');
    }
    function clearViewport() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      previousTop = undefined;
      previousHeight = undefined;
      overlay.style.removeProperty("--chat-viewport-top");
      overlay.style.removeProperty("--chat-viewport-height");
      overlay.removeAttribute("data-chat-keyboard-closing");
    }
    function updateViewport() {
      frame = null;
      if (viewport.scale > 1) return;
      const top = Math.round(viewport.offsetTop);
      const layoutHeight = document.documentElement.clientHeight;
      const height = Math.round(closingKeyboard ? Math.max(layoutHeight, viewport.height) : viewport.height);
      if (viewport.height >= layoutHeight - 1) closingKeyboard = false;
      if (top !== previousTop) overlay.style.setProperty("--chat-viewport-top", `${top}px`);
      if (height !== previousHeight) overlay.style.setProperty("--chat-viewport-height", `${height}px`);
      previousTop = top;
      previousHeight = height;
    }
    function scheduleViewportUpdate() {
      if (frame === null) frame = window.requestAnimationFrame(updateViewport);
    }
    function cancelBlurFrame() {
      if (blurFrame !== null) window.cancelAnimationFrame(blurFrame);
      blurFrame = null;
    }
    function onFocusIn(event) {
      if (!isEditor(event.target)) return;
      cancelBlurFrame();
      closingKeyboard = false;
      overlay.removeAttribute("data-chat-keyboard-closing");
      scheduleViewportUpdate();
    }
    function onFocusOut(event) {
      if (!isEditor(event.target)) return;
      cancelBlurFrame();
      // Let focus settle (e.g. sending refocuses the composer) before anticipating Safari's late resize.
      blurFrame = window.requestAnimationFrame(() => {
        blurFrame = window.requestAnimationFrame(() => {
          blurFrame = null;
          if (isEditor(document.activeElement) || viewport.scale > 1 ||
            document.documentElement.clientHeight <= viewport.height + 1) return;
          closingKeyboard = true;
          overlay.setAttribute("data-chat-keyboard-closing", "");
          if (frame !== null) window.cancelAnimationFrame(frame);
          updateViewport();
        });
      });
    }
    function onTransitionEnd(event) {
      if (event.target.matches(".chat-modal") && event.propertyName === "height") {
        overlay.removeAttribute("data-chat-keyboard-closing");
      }
    }
    function onTouchStart(event) {
      touchTarget = event.touches.length === 1 && isEditor(event.target) ? event.target : null;
    }
    function onTouchMove() {
      touchTarget = null;
    }
    function onTouchEnd(event) {
      const target = touchTarget;
      touchTarget = null;
      if (!target || target !== event.target || target === document.activeElement || event.touches.length) return;
      // Safari otherwise pans the entire page before the viewport resize reaches us.
      event.preventDefault();
      target.focus({ preventScroll: true });
    }
    updateViewport();
    overlay.addEventListener("focusin", onFocusIn);
    overlay.addEventListener("focusout", onFocusOut);
    overlay.addEventListener("transitionend", onTransitionEnd);
    overlay.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay.addEventListener("touchmove", onTouchMove, { passive: true });
    overlay.addEventListener("touchcancel", onTouchMove);
    overlay.addEventListener("touchend", onTouchEnd, { passive: false });
    viewport.addEventListener("resize", scheduleViewportUpdate);
    viewport.addEventListener("scroll", scheduleViewportUpdate);
    return () => {
      cancelBlurFrame();
      overlay.removeEventListener("focusin", onFocusIn);
      overlay.removeEventListener("focusout", onFocusOut);
      overlay.removeEventListener("transitionend", onTransitionEnd);
      overlay.removeEventListener("touchstart", onTouchStart);
      overlay.removeEventListener("touchmove", onTouchMove);
      overlay.removeEventListener("touchcancel", onTouchMove);
      overlay.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("resize", scheduleViewportUpdate);
      viewport.removeEventListener("scroll", scheduleViewportUpdate);
      clearViewport();
    };
  }, [open]);

  function close() {
    search.delete("chat");
    navigate({ pathname: location.pathname, search: search.size ? `?${search}` : "", hash: location.hash },
      { replace: true, preventScrollReset: true, state: location.state });
  }

  return <Modal open={open} onClose={close} title="모임 채팅" closeLabel="채팅 닫기"
    closeAction="chat_dismiss" panelClassName={`chat-modal${selected !== "inbox" ? " chat-modal--room" : ""}`}>
    <Suspense fallback={<p className="chat-modal__loading" role="status">대화를 불러오는 중이에요</p>}>
      <ChatContent roomId={selected === "inbox" ? undefined : selected} />
    </Suspense>
  </Modal>;
}
