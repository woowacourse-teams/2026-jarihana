import { useDeferredValue, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Clock3, Flame, Plus, Search, UsersRound } from "lucide-react";
import { storeReturnTarget, useAuth } from "../../features/auth";
import { listSparrings } from "../../features/sparring/api";
import { Button, PageContainer } from "../../shared/ui";
import { CreateSparring } from "./CreateSparring";
import SparringWideCard from "./SparringWideCard.jsx";
import "./sparring.css";

const filters = [
  { label: "전체", value: "all", icon: Clock3 },
  { label: "대화 있는 판", value: "active", icon: Flame },
  { label: "내가 낀 판", value: "mine", icon: UsersRound }
];
export default function SparringPage() {
  const auth = useAuth();
  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const search = useDeferredValue(keyword.trim());
  const query = useInfiniteQuery({
    queryKey: ["sparrings", filter, search, auth.member?.id],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listSparrings({
        filter,
        keyword: search,
        size: 12,
        ...(pageParam ? { cursor: pageParam } : {})
      }),
    getNextPageParam: (page) => (page.hasNext ? page.nextCursor : undefined)
  });
  function requireMember(action) {
    if (auth.status === "authenticated") return action();
    storeReturnTarget("/sparring");
    auth.login();
  }
  const topics = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <PageContainer className="sparring-page">
      <header className="sparring-heading">
        <div>
          <p className="sparring-eyebrow">같이 이야기해요</p>
          <h1>스파링</h1>
          <p className="sparring-heading__description">
            내 편을 고르고, 한마디를 캡슐에 담아 보내요.
          </p>
        </div>
        <button
          className="sparring-create"
          type="button"
          onClick={() => requireMember(() => setCreating(true))}
          disabled={auth.status === "loading"}
          data-ph-capture-attribute-action="sparring_create"
        >
          <Plus aria-hidden="true" size={19} />
          주제 올리기
        </button>
      </header>
      <div className="sparring-tools">
        <div className="sparring-filters" role="group" aria-label="스파링 목록 필터">
          {filters.map(({ icon: Icon, label, value }) => (
            <button
              key={value}
              className="sparring-filter"
              type="button"
              aria-pressed={filter === value}
              onClick={() =>
                value === "mine" ? requireMember(() => setFilter(value)) : setFilter(value)
              }
              data-ph-capture-attribute-action="sparring_filter_change"
            >
              <Icon aria-hidden="true" size={17} />
              {label}
            </button>
          ))}
        </div>
        <div className="sparring-search">
          <Search aria-hidden="true" size={19} />
          <label className="sparring-sr-only" htmlFor="sparring-search">
            스파링 주제 검색
          </label>
          <input
            id="sparring-search"
            type="search"
            maxLength={80}
            placeholder="궁금한 주제를 찾아보세요"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            data-ph-capture-attribute-action="sparring_search_change"
          />
        </div>
      </div>
      {query.isPending && <p role="status">열린 스파링을 불러오고 있어요.</p>}
      {query.isError && (
        <div role="alert">
          <p>스파링을 불러오지 못했어요.</p>
          <Button
            onClick={() => query.refetch()}
            data-ph-capture-attribute-action="sparring_list_retry"
          >
            다시 불러오기
          </Button>
        </div>
      )}
      {topics.length > 0 && (
        <ul className="sparring-wide-list" aria-label="스파링 주제">
          {topics.map((topic) => (
            <li key={topic.id}>
              <SparringWideCard
                topic={{
                  ...topic,
                  choices: [topic.a, topic.b],
                  preview: {
                    leftPercent:
                      topic.votesA + topic.votesB
                        ? Math.round((100 * topic.votesA) / (topic.votesA + topic.votesB))
                        : null
                  }
                }}
              />
              <Link
                className="sparring-enter"
                to={`/sparring/${topic.id}`}
                data-ph-capture-attribute-action="sparring_join"
              >
                참여하기 <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {query.isSuccess && !topics.length && (
        <div className="sparring-empty" role="status">
          <p>
            {keyword
              ? "찾는 주제가 없어요"
              : filter === "mine"
                ? "아직 참여한 스파링이 없어요"
                : "아직 열린 스파링이 없어요"}
          </p>
          <span>궁금했던 주제로 먼저 이야기를 열어보세요.</span>
        </div>
      )}
      {query.hasNextPage && (
        <Button
          pending={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          data-ph-capture-attribute-action="sparring_list_more"
        >
          더 보기
        </Button>
      )}
      <CreateSparring open={creating} onClose={() => setCreating(false)} />
    </PageContainer>
  );
}
