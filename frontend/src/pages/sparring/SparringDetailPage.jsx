import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../features/auth";
import { useArenaBridge } from "../../features/sparring/useArenaBridge";
import { Button } from "../../shared/ui";
import { ArenaPreview } from "./ArenaPreview";
import "./sparring.css";

const statuses = {
  connecting: "실시간 연결 중",
  live: "실시간 연결됨",
  reconnecting: "다시 연결하는 중",
  offline: "오프라인 · 작성한 내용은 그대로 있어요"
};
function Room({ topicId, member, login, retry, onRetry }) {
  const { frame, error, status, title, loaded, sceneReady, sceneError } = useArenaBridge({ topicId, member, login, retry });
  const visible = loaded && sceneReady;
  return (
    <div className="sparring-detail">
      <div className="sparring-detail__rail">
        <nav className="sparring-detail__navigation" aria-label="토론 위치">
          <Link className="sparring-detail__back" to="/sparring" aria-label="토론 목록으로" title="토론 목록으로" data-ph-capture-attribute-action="sparring_back">
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
        </nav>
        <span role="status" className="sparring-connection" data-connection={status}>
          {statuses[status]}
        </span>
      </div>
      {visible && error && (
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
      <div className="sparring-detail__viewport" data-ready={visible} aria-busy={!visible && !error && !sceneError}>
        {!visible && <ArenaPreview error={error || sceneError} onRetry={onRetry} />}
        <iframe
          key={retry}
          ref={frame}
          className="sparring-arena-frame"
          inert={!visible}
          aria-hidden={!visible}
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
  const { status, member, login } = useAuth();
  if (!/^[1-9]\d*$/.test(topicId)) return <p role="alert">토론 주소가 올바르지 않아요.</p>;
  if (status === "loading") return <div className="sparring-detail__viewport sparring-detail__auth-loading"><ArenaPreview /></div>;
  return (
    <Room
      key={`${topicId}:${member?.id ?? "guest"}:${retry}`}
      topicId={topicId}
      member={member}
      login={login}
      retry={retry}
      onRetry={() => setRetry(value => value + 1)}
    />
  );
}
