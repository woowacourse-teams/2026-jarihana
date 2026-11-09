import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";

import { storeReturnTarget, useAuth } from "../../features/auth";
import {
  PEPERO_DAY_PATH,
  STICK_HALVING_ROOM_PATH,
  createRankedAdapter,
  parseServiceTime,
  peperoDayKeys,
  usePeperoDayRankings,
  usePeperoDayStatus
} from "../../features/pepero-day";
import { ROUNDS, StickHalvingGame, createPracticeAdapter, formatPercent } from "../../features/stick-halving";
import {
  Button,
  EmptyState,
  ErrorState,
  Modal,
  PageContainer,
  PageHeader,
  SectionHeader,
  Skeleton,
  useToast
} from "../../shared/ui";
import "./pepero-day.css";

// 서버가 순위를 한 번에 내려주는 인원과, 끝난 뒤 창에 보여 줄 인원이다.
const RANKING_PAGE = 50;
const DIALOG_RANKING_LIMIT = 10;

const RANKED_ERRORS = {
  MINIGAME_EVENT_NOT_OPEN: "지금은 이벤트 기간이 아니에요.",
  MINIGAME_ROUND_CONFLICT: "이미 자른 막대예요. 새로 시작해 주세요.",
  MINIGAME_RUN_EXPIRED: "시작하고 10분이 지나 끝난 판이에요. 새로 시작해 주세요.",
  MINIGAME_RUN_NOT_FOUND: "도전 기록을 찾을 수 없어요. 새로 시작해 주세요.",
  UNAUTHENTICATED: "로그인이 풀렸어요. 다시 로그인한 뒤 도전해 주세요."
};

export function formatServiceDateTime(value) {
  const [date, time] = value.split("T");
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일 ${time.slice(0, 5)}`;
}

function formatRemaining(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86_400);
  const hours = String(Math.floor((total % 86_400) / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${days ? `${days}일 ` : ""}${hours}:${minutes}:${seconds}`;
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}초`;
}

function resultText(summary) {
  return [`공평하게 반띵 ${summary.totalScore.toLocaleString("ko-KR")}점 (5,000점 만점)`]
    .concat(summary.rows.map((row) => `${row.name}: 오차 ${formatPercent(row.errorRate)}, ${row.score.toLocaleString("ko-KR")}점`))
    .join("\n");
}

// 끝난 이벤트 안내다. 하던 판이 있으면 마저 하게 하고, 아니면 게임방으로 옮겨 가는 때를 알려 준다.
function closedMessage(event, game) {
  if (game) return "하던 판은 끝까지 할 수 있어요. 순위 도전 판은 끝내면 순위에 들어가요.";
  if (event.gameRoomOpen) return "참여해 주셔서 고마워요. 이제 게임방에서 연습으로 계속 할 수 있어요.";
  return `참여해 주셔서 고마워요. ${formatServiceDateTime(event.gameRoomOpensAt)}부터 게임방에서 다시 할 수 있어요.`;
}

function Countdown({ event }) {
  const queryClient = useQueryClient();
  const [offset] = useState(() => parseServiceTime(event.serverTime) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  const opensAt = parseServiceTime(event.opensAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  useEffect(() => {
    if (now < opensAt) return;
    void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
  }, [now, opensAt, queryClient]);

  return (
    <section className="pepero-day__card pepero-day__countdown" aria-live="polite">
      <p className="pepero-day__countdown-label">{formatServiceDateTime(event.opensAt)}에 열려요</p>
      <p className="pepero-day__countdown-time">{formatRemaining(opensAt - now)}</p>
    </section>
  );
}

function RankingRow({ item, me }) {
  return (
    <li className={me && item.rank === me.rank ? "pepero-day__ranking-item--me" : undefined}>
      <span className="pepero-day__rank">{item.rank}</span>
      <span className="pepero-day__nickname">{item.nickname}</span>
      <span className="pepero-day__score">{item.totalScore.toLocaleString("ko-KR")}점</span>
      <span className="pepero-day__duration">{formatDuration(item.totalDurationMillis)}</span>
    </li>
  );
}

// 순위 목록이다. limit이 있으면 위에서부터 그만큼만 보여 주고, 내가 그 밖에 있으면 내 줄을 따로 붙인다.
function RankingList({ items, limit, me }) {
  const shown = limit ? items.slice(0, limit) : items;
  const meOutside = me && !shown.some((item) => item.rank === me.rank);
  return (
    <ol className="pepero-day__ranking-list">
      {shown.map((item) => <RankingRow item={item} key={item.rank} me={me} />)}
      {meOutside ? (
        <>
          <li aria-hidden="true" className="pepero-day__ranking-gap">⋮</li>
          <RankingRow item={me} me={me} />
        </>
      ) : null}
    </ol>
  );
}

export function Ranking({
  board = "event",
  description = "회원마다 가장 좋은 판 하나로 매겨요. 점수가 같으면 더 빨리 자른 기록이 위예요.",
  emptyDescription = "순위 도전을 끝내면 여기에 이름이 올라가요.",
  title = "순위"
}) {
  const rankings = usePeperoDayRankings({ board });

  if (rankings.isPending) return <Skeleton aria-label="순위를 불러오는 중" className="pepero-day__ranking-loading" />;
  if (rankings.isError) {
    return (
      <ErrorState
        action={<Button onClick={() => rankings.refetch()} variant="secondary">다시 불러오기</Button>}
        title="순위를 불러오지 못했어요"
      />
    );
  }
  const { items, me } = rankings.data;
  return (
    <section aria-label={title} className="pepero-day__card pepero-day__ranking">
      <SectionHeader description={description} title={title} />
      {me ? (
        <p className="pepero-day__me">
          내 순위 <strong>{me.rank}위</strong>, {me.totalScore.toLocaleString("ko-KR")}점
        </p>
      ) : null}
      {items.length ? (
        <RankingList items={items} me={me} />
      ) : (
        <EmptyState description={emptyDescription} title="아직 순위에 오른 기록이 없어요" />
      )}
    </section>
  );
}

// 연습 점수가 순위표의 어디쯤인지 센다. 점수가 같으면 걸린 시간을 알 수 없어 같은 점수의 맨 앞에 둔다.
function practiceRank(items, totalScore) {
  return items.filter((item) => item.totalScore > totalScore).length + 1;
}

// 5판을 끝내면 띄우는 순위 창이다. 순위 도전은 방금 끝낸 판이 들어간 순위를 다시 받아 보여 주고,
// 연습은 순위에 들어가지 않으므로 이 점수였다면 몇 위인지 알려 준다.
export function RankingDialog({ board = "event", onChallenge, onClose, result }) {
  const rankings = usePeperoDayRankings({ board });
  const ranked = result.mode === "ranked";
  const refreshing = ranked && rankings.isFetching;
  const data = rankings.data;

  let body;
  if (rankings.isPending || refreshing) {
    body = <Skeleton aria-label="순위를 불러오는 중" className="pepero-day__dialog-loading" />;
  } else if (rankings.isError) {
    body = (
      <ErrorState
        action={<Button onClick={() => rankings.refetch()} variant="secondary">다시 불러오기</Button>}
        title="순위를 불러오지 못했어요"
      />
    );
  } else {
    const position = ranked ? data.me?.rank : practiceRank(data.items, result.totalScore);
    const fullList = data.items.length >= RANKING_PAGE && position > data.items.length;
    body = (
      <>
        <p className="pepero-day__dialog-standing">
          {ranked && data.me ? (
            <>
              내 순위 <strong>{data.me.rank}위</strong>
              {data.me.totalScore > result.totalScore ? `, 최고 기록 ${data.me.totalScore.toLocaleString("ko-KR")}점` : null}
            </>
          ) : null}
          {ranked ? null : (
            <>
              연습 점수는 순위에 들어가지 않아요. 이 점수였다면{" "}
              <strong>{fullList ? `${RANKING_PAGE}위 밖` : `${position}위`}</strong>예요.
            </>
          )}
        </p>
        {data.items.length ? (
          <RankingList items={data.items} limit={DIALOG_RANKING_LIMIT} me={data.me} />
        ) : (
          <EmptyState description="순위 도전을 끝내면 여기에 이름이 올라가요." title="아직 순위에 오른 기록이 없어요" />
        )}
      </>
    );
  }

  return (
    <Modal
      closeAction="pepero_ranking_dismiss"
      description={`이번 판 ${result.totalScore.toLocaleString("ko-KR")}점`}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
      panelClassName="pepero-day__dialog"
      title={ranked ? "순위 도전 결과" : "연습 결과"}
    >
      {body}
      <div className="ui-dialog__actions">
        {onChallenge ? (
          <Button data-ph-capture-attribute-action="pepero_ranking_challenge" onClick={onChallenge}>
            순위 도전하러 가기
          </Button>
        ) : null}
        <Button data-ph-capture-attribute-action="pepero_ranking_close" onClick={onClose} variant="secondary">
          닫기
        </Button>
      </div>
    </Modal>
  );
}

function ModeChooser({ onStart }) {
  const auth = useAuth();

  let rankedAction;
  if (auth.status === "authenticated") {
    rankedAction = (
      <Button
        data-ph-capture-attribute-action="pepero_ranked_start"
        onClick={() => onStart("ranked")}
      >
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
        data-ph-capture-attribute-action="pepero_ranked_login"
        disabled={auth.status === "loading"}
        onClick={() => {
          storeReturnTarget(PEPERO_DAY_PATH);
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
        <h2>순위 도전</h2>
        <p>횟수 제한 없이 몇 번이든 도전할 수 있고, 가장 좋은 기록으로 순위를 매겨요.</p>
        {rankedAction}
      </section>
    </div>
  );
}

function OpenEvent({ closed, game, setGame }) {
  const queryClient = useQueryClient();
  const { danger, success } = useToast();
  const [finished, setFinished] = useState(null);

  // 새 판을 시작할 때마다 새 연결부를 만든다. 순위 도전은 시작하면 남은 횟수가 바뀌므로 상태를 다시 받는다.
  function start(mode) {
    const adapter = mode === "ranked"
      ? createRankedAdapter({ onStarted: () => void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all }) })
      : createPracticeAdapter();
    setGame((previous) => ({ adapter, key: (previous?.key ?? 0) + 1, mode }));
  }

  async function copy(summary) {
    try {
      await navigator.clipboard.writeText(resultText(summary));
      success({ title: "결과를 복사했어요." });
    } catch {
      danger({ title: "복사하지 못했어요. 결과 표를 직접 옮겨 주세요." });
    }
  }

  if (!game) return closed ? null : <ModeChooser onStart={start} />;

  const ranked = game.mode === "ranked";
  return (
    <section className="pepero-day__card pepero-day__game">
      <p className="pepero-day__game-mode">{ranked ? "순위 도전" : "연습"}</p>
      <StickHalvingGame
        adapter={game.adapter}
        errorMessage={(error) => (ranked ? RANKED_ERRORS[error?.code] : null) ?? "잠시 뒤 다시 시도해 주세요."}
        finalActions={(summary) => (
          <>
            <Button data-ph-capture-attribute-action="pepero_mode_choose" onClick={() => setGame(null)} variant="secondary">
              {closed ? "닫기" : "모드 고르기"}
            </Button>
            {summary.rows.length === ROUNDS.length ? (
              <Button data-ph-capture-attribute-action="pepero_result_copy" onClick={() => copy(summary)} variant="secondary">
                결과 복사
              </Button>
            ) : null}
            {ranked || closed ? null : (
              <Button data-ph-capture-attribute-action="pepero_practice_start" onClick={() => start("practice")}>
                새 막대로 다시 하기
              </Button>
            )}
          </>
        )}
        key={game.key}
        onFinish={(summary) => {
          if (ranked) void queryClient.invalidateQueries({ queryKey: peperoDayKeys.all });
          setFinished({ key: game.key, mode: game.mode, totalScore: summary.totalScore });
        }}
      />
      {finished?.key === game.key ? (
        <RankingDialog
          onChallenge={ranked || closed ? null : () => {
            setFinished(null);
            setGame(null);
          }}
          onClose={() => setFinished(null)}
          result={finished}
        />
      ) : null}
    </section>
  );
}

// 빼빼로데이 반 나누기 이벤트 화면이다. 서버가 알려 주는 진행 상태에 따라 여는 시각 전에는
// 남은 시간을, 진행 중에는 게임을, 끝난 뒤에는 최종 순위를 보여 준다.
export function PeperoDayEventPage() {
  const status = usePeperoDayStatus();
  // 하던 판은 페이지가 들고 있어서, 이벤트가 닫혀도 화면에서 사라지지 않고 끝까지 할 수 있다.
  const [game, setGame] = useState(null);

  if (status.isPending) {
    return (
      <PageContainer className="pepero-day">
        <Skeleton aria-label="이벤트를 불러오는 중" className="pepero-day__loading" />
      </PageContainer>
    );
  }

  // 이미 받은 상태가 있으면 다시 받기가 실패해도 그 상태로 계속 그린다. 에러 화면으로 바꾸면 하던 판이 사라지고,
  // 다시 그릴 때 새 판이 시작되어 마감 전에 시작한 순위 도전을 끝낼 수 없다.
  if (status.isError && !status.data) {
    return (
      <PageContainer className="pepero-day">
        <ErrorState
          action={<Button onClick={() => status.refetch()} variant="secondary">다시 불러오기</Button>}
          title="이벤트를 불러오지 못했어요"
        />
      </PageContainer>
    );
  }

  const event = status.data;
  const closed = event.status === "CLOSED";
  return (
    <PageContainer className="pepero-day">
      <PageHeader
        description="무게표와 눈금을 보고 막대과자를 정확히 같은 무게로 잘라 보세요. 초코와 아몬드가 붙은 곳이 더 무거워서, 정답은 막대의 가운데가 아니에요."
        eyebrow="11월 11일 막대과자 데이 이벤트"
        title="공평하게 반띵"
      />
      <p className="pepero-day__period">
        {formatServiceDateTime(event.opensAt)} ~ {formatServiceDateTime(event.closesAt)}. 기간 중 순위 도전 고득점자에게 빼빼로 세트를 드려요.
      </p>
      {event.status === "UPCOMING" ? <Countdown event={event} /> : null}
      {closed ? (
        <section className="pepero-day__card pepero-day__closed">
          <h2>이벤트가 끝났어요</h2>
          <p>{closedMessage(event, game)}</p>
          {event.gameRoomOpen && !game ? (
            <Link
              className="ui-button ui-button--primary ui-button--md"
              data-ph-capture-attribute-action="stick_halving_room_open"
              to={STICK_HALVING_ROOM_PATH}
            >
              게임방에서 하기
            </Link>
          ) : null}
        </section>
      ) : null}
      {event.status === "OPEN" || (closed && game) ? (
        <OpenEvent closed={closed} game={game} setGame={setGame} />
      ) : null}
      {event.status === "UPCOMING" ? null : <Ranking />}
    </PageContainer>
  );
}
