import { Button } from "../../shared/ui";

export function ReadinessControls({ room, isHost, myReady, locked, pending, onReady, onStart }) {
  const bothReady = room.guestMemberId != null && room.hostReady && room.guestReady;
  const canStart = isHost && bothReady;
  const message =
    room.guestMemberId == null
      ? "상대를 기다리는 중"
      : bothReady
        ? isHost
          ? "두 사람 모두 준비됐어요"
          : "방장이 시작할 때까지 기다려 주세요"
        : myReady
          ? "상대의 준비를 기다리는 중"
          : "두 사람 모두 준비한 뒤 방장이 시작해요";
  return (
    <div className="gomoku-readiness">
      <p role="status">{message}</p>
      {canStart && (
        <Button
          block
          disabled={locked}
          pending={pending}
          onClick={() => void onStart()}
          data-ph-capture-attribute-action="gomoku_game_start"
        >
          시작하기
        </Button>
      )}
      <Button
        block
        variant={myReady ? "secondary" : "primary"}
        disabled={locked || room.guestMemberId == null}
        pending={pending && !canStart}
        onClick={() => void onReady()}
        data-ph-capture-attribute-action="gomoku_ready_toggle"
      >
        {myReady ? "준비 취소" : room.status === "FINISHED" ? "다시 대결" : "준비하기"}
      </Button>
    </div>
  );
}
