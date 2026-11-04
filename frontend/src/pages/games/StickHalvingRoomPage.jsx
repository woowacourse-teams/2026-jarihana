import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { PEPERO_DAY_PATH, usePeperoDayStatus } from "../../features/pepero-day";
import { StickHalvingGame, createPracticeAdapter } from "../../features/stick-halving";
import { Button, EmptyState, ErrorState, PageContainer, Skeleton } from "../../shared/ui";
import { Ranking, RankingDialog, formatServiceDateTime } from "../events/PeperoDayEventPage.jsx";
import "./games.css";

function BackToGames() {
  return (
    <Link className="games-back" data-ph-capture-attribute-action="games_back" to="/games">
      <span>
        <ArrowLeft size={16} aria-hidden="true" /> 게임방
      </span>
    </Link>
  );
}

// 빼빼로데이 이벤트가 끝난 뒤 게임방에서 하는 반띵이다. 연습만 할 수 있고 기록은 남지 않는다.
// 옮기는 시각 전에는 언제부터 할 수 있는지 알려 주고, 시각이 되면 상태를 다시 받아 바로 열린다.
export function StickHalvingRoomPage() {
  const status = usePeperoDayStatus();
  const [game, setGame] = useState(() => ({ adapter: createPracticeAdapter(), key: 1 }));
  const [finished, setFinished] = useState(null);

  function restart() {
    setFinished(null);
    setGame((previous) => ({ adapter: createPracticeAdapter(), key: previous.key + 1 }));
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

  if (status.isError) {
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
          <p>
            무게표와 눈금을 보고 막대과자를 정확히 같은 무게로 잘라 보세요. 초코와 아몬드가 붙은 곳이 더 무거워서, 정답은
            막대의 가운데가 아니에요.
          </p>
        </header>
        <section className="pepero-day__card pepero-day__game">
          <p className="pepero-day__game-mode">연습</p>
          <StickHalvingGame
            adapter={game.adapter}
            finalActions={() => (
              <Button data-ph-capture-attribute-action="pepero_practice_start" onClick={restart}>
                새 막대로 다시 하기
              </Button>
            )}
            key={game.key}
            onFinish={(summary) => setFinished({ key: game.key, mode: "practice", totalScore: summary.totalScore })}
          />
          {finished?.key === game.key ? (
            <RankingDialog onChallenge={null} onClose={() => setFinished(null)} result={finished} />
          ) : null}
        </section>
        <Ranking
          description="11월 11일 이벤트 기간의 순위 도전 기록이에요. 게임방에서 한 판은 순위에 들어가지 않아요."
          emptyDescription="이벤트 기간에 순위 도전을 끝낸 기록이 없어요."
          title="이벤트 최종 순위"
        />
      </div>
    </PageContainer>
  );
}
