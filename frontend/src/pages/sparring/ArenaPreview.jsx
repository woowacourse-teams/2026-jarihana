import { Button } from "../../shared/ui";
import { playgroundPeriod } from "../../../public/sparring-arena/src/playground-sky.js";

export function ArenaPreview({ error, onRetry }) {
  const preview = `/sparring-arena/assets/arena-preview-planet-${playgroundPeriod()}`;
  return (
    <div className="sparring-preview">
      <picture>
        <source media="(max-width: 700px)" srcSet={`${preview}-mobile.webp`} width="390" height="774" />
        <img src={`${preview}-desktop.webp`} width="1440" height="998" alt="" fetchPriority="high" />
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
