import { ChevronDown, Trophy } from "lucide-react";
import { useAuth } from "../../auth";
import { Avatar, Button } from "../../../shared/ui";
import { LEVELS } from "./engine.mjs";
import { useRhythmRanking } from "./useRhythmRanking.js";

const number = (value) => value.toLocaleString("ko-KR");
// 1, 2, 3위 줄은 금, 은, 동 색 카드로 보여 준다. 같은 점수로 순위가 같으면 같은 색이다.
const MEDAL_CLASS = { 1: "is-gold", 2: "is-silver", 3: "is-bronze" };

// 옵션과 결과 화면 오른쪽의 난이도별 랭킹이다. 회원마다 가장 높은 기록 한 판으로 줄을 세운다.
// heading이 false면(창 안처럼 제목이 따로 있을 때) 머리 글을 빼고 이름만 붙인다.
export function RhythmRanking({ level, heading = true }) {
  const query = useRhythmRanking(level);
  const { member } = useAuth();
  const rows = query.data
    ? [
        ...new Map(
          query.data.pages.flatMap((page) => page.items).map((item) => [item.memberId, item])
        ).values()
      ]
    : [];
  const me = query.data?.pages[0].me ?? null;
  return (
    <section
      className="rhythm-ranking"
      aria-label={heading ? undefined : LEVELS[level].name + " 랭킹"}
      aria-labelledby={heading ? "rhythm-ranking-title" : undefined}
    >
      {heading ? (
        <header className="rhythm-ranking__heading">
          <span className="eyebrow">RANKING</span>
          <h2 id="rhythm-ranking-title">{LEVELS[level].name} 랭킹</h2>
          <p className="small muted">회원마다 가장 높은 점수 한 판으로 순위를 매겨요.</p>
        </header>
      ) : (
        <p className="small muted">회원마다 가장 높은 점수 한 판으로 순위를 매겨요.</p>
      )}
      {query.isPending ? (
        <p className="rhythm-ranking__state" role="status">
          랭킹을 불러오고 있어요.
        </p>
      ) : query.isError && !query.data ? (
        <div className="rhythm-ranking__state" role="alert">
          <p>랭킹을 불러오지 못했어요.</p>
          <Button
            data-ph-capture-attribute-action="rhythm_ranking_retry"
            onClick={() => void query.refetch()}
            size="sm"
            variant="secondary"
          >
            다시 불러오기
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rhythm-ranking__state">
          <Trophy size={32} aria-hidden="true" />
          <p>아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요.</p>
        </div>
      ) : (
        <>
          <p className="rhythm-ranking__mine">
            <span>내 순위</span>
            <strong>{me ? me.rank + "위" : "-"}</strong>
            <span>{me ? "최고 " + number(me.score) + "점" : "도전을 마치면 순위가 생겨요."}</span>
          </p>
          <ol className="rhythm-ranking__list">
            {rows.map((row) => {
              const mine = row.memberId === member?.id;
              const className = [MEDAL_CLASS[row.rank], mine ? "is-mine" : null]
                .filter(Boolean)
                .join(" ");
              return (
                <li className={className || undefined} key={row.memberId}>
                  <span className="rhythm-ranking__rank">
                    {row.rank}
                    <span className="sr-only">위</span>
                  </span>
                  <span className="rhythm-ranking__member">
                    <Avatar
                      alt={row.name + " 프로필"}
                      fallback={row.name.slice(0, 1)}
                      size="sm"
                      src={row.avatarUrl}
                    />
                    <span>{row.name}</span>
                    {mine ? <small>나</small> : null}
                  </span>
                  <span className="rhythm-ranking__score">
                    <b>{number(row.score)}</b>
                    <small>LOOP {row.loopReached}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {query.isFetchNextPageError ? (
        <p className="small" role="alert">
          다음 순위를 불러오지 못했어요.
        </p>
      ) : null}
      {query.hasNextPage ? (
        <Button
          data-ph-capture-attribute-action="rhythm_ranking_more"
          onClick={() => void query.fetchNextPage()}
          pending={query.isFetchingNextPage}
          size="sm"
          variant="secondary"
        >
          랭킹 더 보기 <ChevronDown size={16} aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}
