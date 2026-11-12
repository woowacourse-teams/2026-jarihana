import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import {
  PEPERO_DAY_PATH,
  STICK_HALVING_ROOM_PATH,
  createRankedAdapter,
  peperoDayKeys,
  usePeperoDayStatus
} from "../../features/pepero-day";
import { StickHalvingGame } from "../../features/stick-halving";
import { Button, EmptyState, ErrorState, PageContainer, Skeleton } from "../../shared/ui";
import { Ranking, RankingDialog, StartPrompt, formatServiceDateTime } from "../events/PeperoDayEventPage.jsx";
import "./games.css";

const RANKED_ERRORS = {
  MINIGAME_GAME_ROOM_NOT_OPEN: "아직 게임방에서 할 수 없어요.",
  MINIGAME_ROUND_CONFLICT: "이미 자른 막대예요. 새로 시작해 주세요.",
  MINIGAME_RUN_EXPIRED: "시작하고 10분이 지나 끝난 판이에요. 새로 시작해 주세요.",
  MINIGAME_RUN_NOT_FOUND: "도전 기록을 찾을 수 없어요. 새로 시작해 주세요.",
  UNAUTHENTICATED: "로그인이 풀렸어요. 다시 로그인한 뒤 도전해 주세요."
};

function BackToGames() {
  return (
    <Link className="games-back" data-ph-capture-attribute-action="games_back" to="/games">
      <span>
        <ArrowLeft size={16} aria-hidden="true" /> 게임방
      </span>
    </Link>
  );
}

// 빼빼로데이 이벤트가 끝난 뒤 게임방에서 하는 반띵이다. 이벤트 때처럼 회원이 시작하기를 누르면 바로 순위 도전 판을
// 받고(횟수 제한 없음), 게임방 순위는 이벤트 최종 순위와 따로 매긴다. 옮기는 시각 전에는 언제부터 할 수 있는지 알려 준다.
export function StickHalvingRoomPage() {
  const queryClient = useQueryClient();
  const status = usePeperoDayStatus();
  const [game, setGame] = useState(null);
  const [finished, setFinished] = useState(null);

  function start() {
    const adapter = createRankedAdapter({ board: "room" });
    setFinished(null);
    setGame((previous) => ({ adapter, key: (previous?.key ?? 0) + 1 }));
  }

  if (status.isPending) {
    return (
      <PageContainer>
        <div className="games-page">
          <Skeleton aria-label="게임을 불러오는 중" className="stick-room__loading" />
        </div>
      </PageContainer>
    );
  }

  // 이미 받은 상태가 있으면 다시 받기가 실패해도 그 상태로 계속 그려 하던 판을 지킨다.
  if (status.isError && !status.data) {
    return (
      <PageContainer>
        <div className="games-page">
          <ErrorState
            action={<Button onClick={() => status.refetch()} variant="secondary">다시 불러오기</Button>}
            title="게임을 불러오지 못했어요"
          />
        </div>
      </PageContainer>
    );
  }

  const event = status.data;
  if (!event.gameRoomOpen) {
    return (
      <PageContainer>
        <div className="games-page stick-room">
          <BackToGames />
          <EmptyState
            action={
              <Link
                className="ui-button ui-button--secondary ui-button--md"
                data-ph-capture-attribute-action="pepero_day_view"
                to={PEPERO_DAY_PATH}
              >
                이벤트 페이지로 가기
              </Link>
            }
            description={`${formatServiceDateTime(event.gameRoomOpensAt)}부터 게임방에서 할 수 있어요.`}
            title="아직 게임방에 없는 게임이에요"
          />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="games-page stick-room">
        <BackToGames />
        <header className="games-heading">
          <h1>공평하게 반띵</h1>
        </header>
        {game ? (
          <section className="pepero-day__card pepero-day__game">
            <StickHalvingGame
              adapter={game.adapter}
              errorMessage={(error) => RANKED_ERRORS[error?.code] ?? "잠시 뒤 다시 시도해 주세요."}
              finalActions={() => (
                <Button data-ph-capture-attribute-action="stick_halving_room_ranked_start" onClick={start}>
                  새 막대로 다시 도전
                </Button>
              )}
              key={game.key}
              onFinish={(summary) => {
                void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
                setFinished({ key: game.key, totalScore: summary.totalScore });
              }}
              onRestart={start}
            />
            {finished?.key === game.key ? (
              <RankingDialog board="room" onClose={() => setFinished(null)} result={finished} />
            ) : null}
          </section>
        ) : (
          // 이벤트 시작 카드와 같은 카드다. 반으로 잘린 막대 그림 아래에서 회원은 바로 시작하고, 아니면 로그인한다.
          <StartPrompt
            loginAction="stick_halving_room_login"
            onStart={start}
            returnTarget={STICK_HALVING_ROOM_PATH}
            startAction="stick_halving_room_ranked_start"
          />
        )}
        <Ranking
          board="room"
          emptyDescription="게임방에서 순위 도전을 끝내면 여기에 이름이 올라가요."
          title="게임방 순위"
        />
        <Ranking
          description="11월 11일 이벤트 기간의 기록이에요."
          emptyDescription="이벤트 기간에 순위 도전을 끝낸 기록이 없어요."
          title="이벤트 최종 순위"
        />
      </div>
    </PageContainer>
  );
}
