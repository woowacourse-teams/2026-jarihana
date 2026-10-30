import { Button } from "../../shared/ui";

export function ArenaPreview({ error, onRetry }) {
  return (
    <div className="sparring-preview">
      <picture>
        <source media="(max-width: 700px)" srcSet="/sparring-arena/assets/arena-preview-mobile.webp" />
        <img src="/sparring-arena/assets/arena-preview-desktop.webp" alt="" fetchPriority="high" />
      </picture>
      <div className="sparring-preview__status" role={error ? "alert" : "status"}>
        {!error && <span className="sparring-preview__capsule" aria-hidden="true" />}
        <p>{error || "토론을 준비하고 있어요"}</p>
        {error && (
          <Button variant="secondary" onClick={onRetry} data-ph-capture-attribute-action="sparring_room_retry">
            다시 불러오기
          </Button>
        )}
      </div>
    </div>
  );
}
