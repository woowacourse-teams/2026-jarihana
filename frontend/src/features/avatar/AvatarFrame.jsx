import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readAvatarAppearance } from "../../../public/sparring-arena/src/avatar-appearance.js";

const CHANNEL = "jarihana-avatar-studio";

// Only appearance data crosses this boundary; authentication stays in the app API client.
export function AvatarFrame({ appearance, mode = "editor", onChange, onReady, onError }) {
  const frame = useRef(null);
  const callbacks = useRef({ onChange, onReady, onError });
  const initial = useRef(appearance);
  const [height, setHeight] = useState(mode === "preview" ? 280 : 820);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callbacks.current = { onChange, onReady, onError }; });
  useLayoutEffect(() => {
    if (mode !== "preview") return;
    initial.current = appearance;
    frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: "preview-appearance", appearance }, window.location.origin);
  }, [appearance, mode]);
  useLayoutEffect(() => {
    let timer;
    const fail = () => { setFailed(true); callbacks.current.onError?.(); };
    const start = () => {
      frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: "initialize", appearance: initial.current }, window.location.origin);
    };
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== CHANNEL) return;
      const message = event.data;
      if (message.type === "ready") start();
      if (message.type === "initialized") {
        clearTimeout(timer); setFailed(false); callbacks.current.onReady?.();
      }
      if (message.type === "change") {
        const next = readAvatarAppearance(message.appearance);
        if (next) callbacks.current.onChange?.(next);
      }
      if (message.type === "resize" && Number.isFinite(message.height)) setHeight(Math.min(2200, Math.max(240, message.height)));
      if (message.type === "error") { clearTimeout(timer); fail(); }
    }
    window.addEventListener("message", receive);
    // Retry the handshake on load as well, including a cached iframe document.
    const element = frame.current;
    element.addEventListener("load", start);
    timer = setTimeout(fail, 20000);
    start();
    return () => { clearTimeout(timer); window.removeEventListener("message", receive); element.removeEventListener("load", start); };
  }, []);
  return (
    <div className="avatar-frame-wrap" data-ph-private>
      {failed ? <p role="alert">입체 캐릭터를 표시하지 못했어요. 페이지를 새로고침하거나 WebGL을 지원하는 브라우저에서 다시 열어주세요.</p> : null}
      <iframe
        className="avatar-frame"
        ref={frame}
        src={`/sparring-arena/avatar-studio/index.html?mode=${mode === "preview" ? "preview" : "editor"}`}
        style={{ height }}
        title={mode === "preview" ? "저장된 내 아바타" : "아바타 파츠 편집기"}
      />
    </div>
  );
}
