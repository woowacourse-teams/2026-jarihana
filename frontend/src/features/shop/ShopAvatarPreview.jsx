import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { SHOP_PREVIEW_CHANNEL } from "../../../public/sparring-arena/shop-preview/channel.js";

export function ShopAvatarPreview({ appearance }) {
  const frame = useRef(null);
  const [failed, setFailed] = useState(false);
  const sendAppearance = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { channel: SHOP_PREVIEW_CHANNEL, type: "appearance", appearance },
      window.location.origin
    );
  }, [appearance]);

  useLayoutEffect(() => {
    const timer = setTimeout(() => setFailed(true), 20000);
    function receive(event) {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== SHOP_PREVIEW_CHANNEL
      ) return;

      if (event.data.type === "shown" || event.data.type === "error") {
        clearTimeout(timer);
        setFailed(event.data.type === "error");
      }
    }
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, []);
  useLayoutEffect(sendAppearance, [sendAppearance]);

  return (
    <div className="shop-avatar-preview" data-ph-private>
      {failed ? <p role="alert">입체 캐릭터를 표시하지 못했어요. WebGL을 지원하는 브라우저에서 다시 열어주세요.</p> : null}
      <iframe
        ref={frame}
        src="/sparring-arena/shop-preview/index.html"
        title="예시 캐릭터 입어보기"
        onLoad={sendAppearance}
      />
    </div>
  );
}
