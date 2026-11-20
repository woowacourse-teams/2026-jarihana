import { Armchair, ArrowDownWideNarrow, ChevronDown, Crown, Trophy } from "lucide-react";
import { useAuth } from "../../features/auth";
import { useGomokuRanking } from "../../features/gomoku/useGomokuStatistics";
import { Avatar, Button } from "../../shared/ui";
import signatureChair from "../../shared/assets/landing/landing-hero-chair.webp";
import { GomokuStatisticsState } from "./GomokuHistory";

const rate = (value) => (value == null ? "-" : `${value.toFixed(1)}%`);
function Winner({ player, place }) {
  if (!player)
    return <div className="gomoku-ranking-vacancy" aria-label={`${place}위 자리 비어 있음`} />;
  const champion = place === 1;
  return (
    <div className={champion ? "gomoku-ranking-champion" : "gomoku-ranking-runner"}>
      {champion ? (
        <div className="gomoku-ranking-chair-scene">
          <div className="gomoku-ranking-halo" aria-hidden="true" />
          <img className="gomoku-ranking-chair" src={signatureChair} alt="자리하나 시그니처 의자" />
          <Crown className="gomoku-ranking-crown" aria-hidden="true" />
          <Avatar
            className="gomoku-ranking-champion-profile"
            src={player.avatarUrl}
            alt={`${player.name} 프로필`}
            fallback={player.name.slice(0, 1)}
          />
        </div>
      ) : (
        <>
          <span className="gomoku-ranking-place">
            {place}
            <span className="ui-sr-only">위</span>
          </span>
          <Avatar
            className={`gomoku-ranking-runner-profile gomoku-ranking-runner-profile--${place}`}
            src={player.avatarUrl}
            alt={`${player.name} 프로필`}
            fallback={player.name.slice(0, 1)}
          />
        </>
      )}
      <div className="gomoku-ranking-winner-name">
        {champion && <span>1위</span>}
        <strong>{player.name}</strong>
      </div>
      <div className="gomoku-ranking-wins">
        <b>{player.wins}</b>승
      </div>
      <span className="gomoku-ranking-rate">승률 {rate(player.winRate)}</span>
    </div>
  );
}

export function GomokuRanking() {
  const query = useGomokuRanking();
  const { member } = useAuth();
  if (query.isPending || (query.isError && !query.data))
    return (
      <GomokuStatisticsState
        loading={query.isPending}
        error={query.isError}
        action="gomoku_ranking_retry"
        onRetry={() => void query.refetch()}
      />
    );
  const rows = [
    ...new Map(
      query.data.pages.flatMap((page) => page.items).map((item) => [item.memberId, item])
    ).values()
  ];
  const me = query.data.pages[0].me;
  return (
    <div className="gomoku-statistics">
      <div className="gomoku-statistics-heading gomoku-ranking-heading">
        <div>
          <h2>승리의 자리</h2>
        </div>
        <span>
          <ArrowDownWideNarrow size={14} aria-hidden="true" /> 누적 승수순
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="gomoku-statistics-empty">
          <Trophy size={36} aria-hidden="true" />
          <h3>아직 주인공이 없는 자리예요</h3>
          <p>첫 대국을 마치고 랭킹에 이름을 올려보세요.</p>
        </div>
      ) : (
        <>
          <div className="gomoku-ranking-podium" aria-label="상위 세 명">
            <Winner player={rows.find((row) => row.rank === 2)} place={2} />
            <Winner player={rows.find((row) => row.rank === 1)} place={1} />
            <Winner player={rows.find((row) => row.rank === 3)} place={3} />
          </div>
          <div className="gomoku-ranking-mine">
            <div>
              <span className="gomoku-ranking-mine-icon">
                <Armchair aria-hidden="true" />
              </span>
              <span>내 자리</span>
              <strong>
                {me ? (
                  <>
                    {me.rank}
                    <small>위</small>
                  </>
                ) : (
                  "-"
                )}
              </strong>
            </div>
            <div>
              {me ? (
                <>
                  <span>
                    <b>{me.wins}승</b> {me.losses}패 {me.draws}무
                  </span>
                  <span>
                    승률 <b>{rate(me.winRate)}</b>
                  </span>
                </>
              ) : (
                <span>대국을 마치면 순위가 생겨요.</span>
              )}
            </div>
          </div>
          {rows.some((row) => row.rank > 3) && (
            <>
              <div className="gomoku-ranking-columns" aria-hidden="true">
                <span>순위</span>
                <span>크루</span>
                <span>전적</span>
                <span>승률</span>
              </div>
              <ol className="gomoku-ranking-list" start={4}>
                {rows
                  .filter((row) => row.rank > 3)
                  .map((row) => (
                    <li
                      key={row.memberId}
                      className={row.memberId === member?.id ? "gomoku-ranking-self" : undefined}
                    >
                      <span className="gomoku-ranking-position">
                        {row.rank}
                        <span className="ui-sr-only">위</span>
                      </span>
                      <div className="gomoku-ranking-member">
                        <Avatar
                          size="sm"
                          alt={`${row.name} 프로필`}
                          src={row.avatarUrl}
                          fallback={row.name.slice(0, 1)}
                        />
                        <span>{row.name}</span>
                        {row.memberId === member?.id && <small>나</small>}
                      </div>
                      <span className="gomoku-ranking-record">
                        <b>{row.wins}승</b>
                        <span>
                          {row.losses}패 {row.draws}무
                        </span>
                      </span>
                      <span className="gomoku-ranking-percentage">{rate(row.winRate)}</span>
                    </li>
                  ))}
              </ol>
            </>
          )}
        </>
      )}
      {query.isFetchNextPageError && (
        <GomokuStatisticsState
          error
          action="gomoku_ranking_more_retry"
          onRetry={() => void query.fetchNextPage()}
        />
      )}
      {query.hasNextPage && (
        <div className="games-actions">
          <Button
            variant="secondary"
            pending={query.isFetchingNextPage}
            data-ph-capture-attribute-action="gomoku_ranking_more"
            onClick={() => void query.fetchNextPage()}
          >
            랭킹 더 보기 <ChevronDown size={16} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
