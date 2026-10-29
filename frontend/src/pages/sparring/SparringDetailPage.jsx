import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../../features/auth";
import { useArenaBridge } from "../../features/sparring/useArenaBridge";
import { Button } from "../../shared/ui";
import "./sparring.css";

const statuses = {
  connecting: "실시간 연결 중",
  live: "실시간 연결됨",
  reconnecting: "다시 연결하는 중",
  offline: "오프라인 · 작성한 내용은 그대로 있어요"
};
function Room({ topicId, member, login }) {
  const [retry, setRetry] = useState(0);
  const { frame, error, status, title, loaded } = useArenaBridge({ topicId, member, login, retry });
  return (
    <div className="sparring-detail">
      <div className="sparring-detail__rail">
        <Link to="/sparring" data-ph-capture-attribute-action="sparring_back">
          ← 다른 스파링
        </Link>
        <span role="status" className="sparring-connection" data-connection={status}>
          {statuses[status]}
        </span>
      </div>
      {!loaded && !error && (
        <p className="sparring-detail__loading" role="status">
          경기장을 준비하고 있어요.
        </p>
      )}
      {error && (
        <div className="sparring-detail__error" role="alert">
          <p>{error}</p>
          <Button
            onClick={() => setRetry((value) => value + 1)}
            data-ph-capture-attribute-action="sparring_room_retry"
          >
            다시 불러오기
          </Button>
        </div>
      )}
      <iframe
        key={retry}
        ref={frame}
        className="sparring-arena-frame"
        style={error && !loaded ? { display: "none" } : undefined}
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
  );
}
export function SparringDetailPage() {
  const { topicId } = useParams();
  const { status, member, login } = useAuth();
  if (!/^[1-9]\d*$/.test(topicId)) return <p role="alert">스파링 주소가 올바르지 않아요.</p>;
  if (status === "loading") return <p role="status">경기장을 준비하고 있어요.</p>;
  return (
    <Room
      key={`${topicId}:${member?.id ?? "guest"}`}
      topicId={topicId}
      member={member}
      login={login}
    />
  );
}
