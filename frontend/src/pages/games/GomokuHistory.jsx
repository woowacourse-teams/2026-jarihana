import { ChevronDown, Swords } from "lucide-react";
import { Avatar, Button } from "../../shared/ui";
import { useGomokuHistory } from "../../features/gomoku/useGomokuStatistics";

const resultName = { WIN: "승리", LOSE: "패배", DRAW: "무승부" };
function endReason(item) {
  if (item.endReason === "RESIGN") return item.result === "WIN" ? "상대 기권" : "기권";
  return { FIVE: "오목 완성", DRAW: "판 가득 참", TIMEOUT: "시간 초과" }[item.endReason];
}

export function GomokuStatisticsState({ loading, error, onRetry, action }) {
  if (loading)
    return (
      <p className="gomoku-statistics-state" role="status">
        기록을 불러오고 있어요.
      </p>
    );
  if (!error) return null;
  return (
    <div className="gomoku-statistics-state" role="alert">
      <p>기록을 불러오지 못했어요.</p>
      <Button variant="secondary" data-ph-capture-attribute-action={action} onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

export function GomokuHistory({ onBrowse }) {
  const { summary, history } = useGomokuHistory();
  const initialError = summary.isError || (history.isError && !history.data);
  if (summary.isPending || history.isPending || initialError)
    return (
      <GomokuStatisticsState
        loading={!initialError}
        error={initialError}
        action="gomoku_history_retry"
        onRetry={() => {
          void summary.refetch();
          void history.refetch();
        }}
      />
    );
  const stats = summary.data;
  const items = [
    ...new Map(
      history.data.pages.flatMap((page) => page.items).map((item) => [item.id, item])
    ).values()
  ];
  return (
    <div className="gomoku-statistics">
      <section className="gomoku-history-summary" aria-label="전적 요약">
        <div>
          <span className="gomoku-statistics-eyebrow">나의 대국</span>
          <h2>{stats.total}판의 기록</h2>
          <dl className="gomoku-history-totals">
            {[
              ["승리", stats.wins],
              ["패배", stats.losses],
              ["무승부", stats.draws]
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div
          className="gomoku-win-rate"
          aria-label={
            stats.winRate == null
              ? "아직 대국 기록이 없습니다"
              : `승률 ${stats.winRate.toFixed(1)}퍼센트`
          }
        >
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="gomoku-win-rate-track" cx="60" cy="60" r="49" />
            <circle
              className="gomoku-win-rate-value"
              cx="60"
              cy="60"
              r="49"
              pathLength="100"
              strokeDasharray={`${stats.winRate ?? 0} 100`}
            />
          </svg>
          <div>
            <span>승률</span>
            <strong>
              {stats.winRate == null ? "-" : stats.winRate.toFixed(1)}
              {stats.winRate != null && <small>%</small>}
            </strong>
          </div>
        </div>
      </section>
      <div className="gomoku-statistics-heading">
        <h2>함께 둔 대국</h2>
        <span>최신순</span>
      </div>
      {items.length === 0 ? (
        <div className="gomoku-statistics-empty">
          <Swords size={36} aria-hidden="true" />
          <h3>첫 대국을 기다리고 있어요</h3>
          <p>한 판을 마치면 이곳에 기록이 남아요.</p>
          <Button onClick={onBrowse} data-ph-capture-attribute-action="gomoku_history_browse">
            대기방 둘러보기
          </Button>
        </div>
      ) : (
        <ul className="gomoku-history-list">
          {items.map((item) => (
            <li key={item.id}>
              <span
                className={`gomoku-history-result gomoku-history-result--${item.result.toLowerCase()}`}
              >
                {resultName[item.result]}
              </span>
              <div className="gomoku-history-opponent">
                <Avatar
                  alt={`${item.opponentName} 프로필`}
                  src={item.opponentAvatarUrl}
                  fallback={item.opponentName.slice(0, 1)}
                  size="sm"
                />
                <div>
                  <strong>{item.opponentName}</strong>
                  <p>{item.rule === "RENJU" ? "기본 규칙" : "제한 없음"}</p>
                </div>
              </div>
              <span className="gomoku-history-reason">{endReason(item)}</span>
              <time className="gomoku-history-date" dateTime={item.endedAt}>
                <span>{item.endedAt.slice(0, 10).replaceAll("-", ".")}</span>
                <span>{item.endedAt.slice(11, 16)}</span>
              </time>
            </li>
          ))}
        </ul>
      )}
      {history.isFetchNextPageError && (
        <GomokuStatisticsState
          error
          action="gomoku_history_more_retry"
          onRetry={() => void history.fetchNextPage()}
        />
      )}
      {history.hasNextPage && (
        <div className="games-actions">
          <Button
            variant="secondary"
            pending={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
            data-ph-capture-attribute-action="gomoku_history_more"
          >
            기록 더 보기 <ChevronDown size={16} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
