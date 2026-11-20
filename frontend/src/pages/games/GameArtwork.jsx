import { useState } from "react";
import { Gamepad2, Music2 } from "lucide-react";
import { StickHalvingArtwork } from "../../features/stick-halving/StickHalvingArtwork";
import { gameArtwork } from "./artworkAssets";

export function GameArtwork({ game, priority = false, className = "" }) {
  const [failedSource, setFailedSource] = useState(null);
  // 반띵은 이미지 대신 게임의 막대 그림을 그대로 그린다.
  if (game === "stick-halving") {
    return (
      <div className={`games-artwork ${className}`} aria-hidden="true">
        <StickHalvingArtwork />
      </div>
    );
  }
  const source = gameArtwork[game];
  const Fallback = game === "gomoku" ? Gamepad2 : Music2;
  return (
    <div className={`games-artwork ${className}`} aria-hidden="true">
      {failedSource === source ? (
        <Fallback className="games-artwork__fallback" />
      ) : (
        <img
          alt=""
          src={source}
          width={1536}
          height={1024}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailedSource(source)}
        />
      )}
    </div>
  );
}
