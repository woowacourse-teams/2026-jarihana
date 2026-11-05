import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { storeReturnTarget, useAuth } from "../../features/auth";
import {
  PEPERO_DAY_PATH,
  STICK_HALVING_ROOM_PATH,
  createRankedAdapter,
  peperoDayKeys,
  usePeperoDayStatus
} from "../../features/pepero-day";
import { StickHalvingGame, createPracticeAdapter } from "../../features/stick-halving";
import { Button, EmptyState, ErrorState, PageContainer, Skeleton } from "../../shared/ui";
import { Ranking, RankingDialog, formatServiceDateTime } from "../events/PeperoDayEventPage.jsx";
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

function RoomModeChooser({ onStart }) {
  const auth = useAuth();

  let rankedAction;
  if (auth.status === "authenticated") {
    rankedAction = (
      <Button data-ph-capture-attribute-action="stick_halving_room_ranked_start" onClick={() => onStart("ranked")}>
        순위 도전 시작
      </Button>
    );
  } else if (auth.status === "signup-required") {
    rankedAction = (
      <Link className="ui-button ui-button--primary ui-button--md" data-ph-capture-attribute-action="signup_continue" to="/signup">
        가입 계속하기
      </Link>
    );
  } else {
    rankedAction = (
      <Button
        data-ph-capture-attribute-action="stick_halving_room_login"
        disabled={auth.status === "loading"}
        onClick={() => {
          storeReturnTarget(STICK_HALVING_ROOM_PATH);
          auth.login();
        }}
      >
        GitHub로 로그인하고 도전하기
      </Button>
    );
  }

  return (
    <div className="pepero-day__modes">
      <section className="pepero-day__card pepero-day__mode">
        <h2>연습하기</h2>
        <p>로그인 없이 몇 번이든 할 수 있어요. 기록은 순위에 오르지 않아요.</p>
        <Button data-ph-capture-attribute-action="pepero_practice_start" onClick={() => onStart("practice")} variant="secondary">
          연습 시작
        </Button>
      </section>
      <section className="pepero-day__card pepero-day__mode pepero-day__mode--ranked">
        <h2>게임방 순위 도전</h2>
        <p>횟수 제한 없이 몇 번이든 도전할 수 있고, 가장 좋은 기록으로 게임방 순위를 매겨요. 이벤트 순위와는 따로예요.</p>
        {rankedAction}
      </section>
    </div>
  );
}

// 빼빼로데이 이벤트가 끝난 뒤 게임방에서 하는 반띵이다. 연습은 누구나, 순위 도전은 회원이 횟수 제한 없이 하고
// 게임방 순위는 이벤트 최종 순위와 따로 매긴다. 옮기는 시각 전에는 언제부터 할 수 있는지 알려 준다.
export function StickHalvingRoomPage() {
  const queryClient = useQueryClient();
  const status = usePeperoDayStatus();
  const [game, setGame] = useState(null);
  const [finished, setFinished] = useState(null);

  function start(mode) {
    const adapter = mode === "ranked" ? createRankedAdapter({ board: "room" }) : createPracticeAdapter();
    setFinished(null);
    setGame((previous) => ({ adapter, key: (previous?.key ?? 0) + 1, mode }));
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

  const ranked = game?.mode === "ranked";
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
        {game ? (
          <section className="pepero-day__card pepero-day__game">
            <p className="pepero-day__game-mode">{ranked ? "게임방 순위 도전" : "연습"}</p>
            <StickHalvingGame
              adapter={game.adapter}
              errorMessage={(error) => (ranked ? RANKED_ERRORS[error?.code] : null) ?? "잠시 뒤 다시 시도해 주세요."}
              finalActions={() => (
                <>
                  <Button data-ph-capture-attribute-action="pepero_mode_choose" onClick={() => setGame(null)} variant="secondary">
                    모드 고르기
                  </Button>
                  <Button
                    data-ph-capture-attribute-action={ranked ? "stick_halving_room_ranked_start" : "pepero_practice_start"}
                    onClick={() => start(game.mode)}
                  >
                    {ranked ? "새 막대로 다시 도전" : "새 막대로 다시 하기"}
                  </Button>
                </>
              )}
              key={game.key}
              onFinish={(summary) => {
                if (ranked) void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
                setFinished({ key: game.key, mode: game.mode, totalScore: summary.totalScore });
              }}
            />
            {finished?.key === game.key ? (
              <RankingDialog board="room" onChallenge={null} onClose={() => setFinished(null)} result={finished} />
            ) : null}
          </section>
        ) : (
          <RoomModeChooser onStart={start} />
        )}
        <Ranking
          board="room"
          description="게임방 순위 도전 기록이에요. 회원마다 가장 좋은 판 하나로 매기고, 점수가 같으면 더 빨리 자른 기록이 위예요."
          emptyDescription="게임방에서 순위 도전을 끝내면 여기에 이름이 올라가요."
          title="게임방 순위"
        />
        <Ranking
          description="11월 11일 이벤트 기간의 순위 도전 기록이에요. 게임방에서 한 판은 들어가지 않아요."
          emptyDescription="이벤트 기간에 순위 도전을 끝낸 기록이 없어요."
          title="이벤트 최종 순위"
        />
      </div>
    </PageContainer>
  );
}
