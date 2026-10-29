import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageCircle, Search, Users } from "lucide-react";
import { Link } from "react-router";
import { storeReturnTarget, useAuth } from "../../features/auth";
import { listSparrings } from "../../features/sparring/api";
import { Button, PageContainer, StatusBadge } from "../../shared/ui";
import { CreateSparring } from "./CreateSparring";
import { SparringCreateIcon } from "./SparringCreateIcon";
import { remainingDeadline } from "./sparringDeadline";
import rivalClash from "../../shared/assets/illustrations/sparring-rival-clash.webp";
import rivalLift from "../../shared/assets/illustrations/sparring-rival-lift.webp";
import introHero from "../../shared/assets/illustrations/debate-capsule-sea-hero.webp";
import "./sparring.css";

export default function SparringPage() {
  const auth = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const carouselRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const [scrollEdges, setScrollEdges] = useState({ start: true, end: true });
  const search = useDeferredValue(keyword.trim());
  const query = useInfiniteQuery({
    queryKey: ["sparrings", "open", search],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      listSparrings({
        filter: "open",
        keyword: search,
        size: 12,
        ...(pageParam ? { cursor: pageParam } : {})
      }),
    getNextPageParam: (page) => (page.hasNext ? page.nextCursor : undefined)
  });
  const closedQuery = useInfiniteQuery({
    queryKey: ["sparrings", "closed", search],
    initialPageParam: null,
    queryFn: ({ pageParam }) => listSparrings({
      filter: "closed",
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
  const topics = (query.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (topic) => !topic.closesAt || new Date(topic.closesAt).getTime() > now
  );
  const closedTopics = closedQuery.data?.pages.flatMap((page) => page.items) ?? [];
  function updateScrollEdges(element) {
    setScrollEdges({
      start: element.scrollLeft <= 1,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1
    });
  }
  function loadMoreTopics() {
    if (!query.hasNextPage || query.isFetchingNextPage || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    void query.fetchNextPage().finally(() => { loadingMoreRef.current = false; });
  }
  function handleCarouselScroll(event) {
    const element = event.currentTarget;
    updateScrollEdges(element);
    if (element.scrollLeft + element.clientWidth >= element.scrollWidth - 80) loadMoreTopics();
  }
  function moveCarousel(direction) {
    const element = carouselRef.current;
    if (!element) return;
    if (direction > 0 && element.scrollLeft + element.clientWidth >= element.scrollWidth - 1) {
      loadMoreTopics();
      return;
    }
    const card = element.firstElementChild;
    const distance = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap || 0) : element.clientWidth;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * distance, behavior: reduceMotion ? "auto" : "smooth" });
  }
  useEffect(() => {
    const element = carouselRef.current;
    if (!element) return undefined;
    const update = () => updateScrollEdges(element);
    const frame = requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [topics.length]);
  const refreshedExpired = useRef(new Set());
  const { data: openData, refetch: refetchOpen } = query;
  const { refetch: refetchClosed } = closedQuery;
  useEffect(() => {
    const expired = (openData?.pages.flatMap((page) => page.items) ?? []).filter(
      (topic) => topic.closesAt && new Date(topic.closesAt).getTime() <= now && !refreshedExpired.current.has(topic.id)
    );
    if (expired.length) {
      expired.forEach((topic) => refreshedExpired.current.add(topic.id));
      void refetchOpen();
      void refetchClosed();
    }
  }, [now, openData, refetchOpen, refetchClosed]);
  return (
    <PageContainer className="sparring-page">
      <header className="sparring-intro">
        <img className="sparring-intro__image" src={introHero} width={2103} height={748} fetchPriority="high" alt="" />
        <div className="sparring-intro__content">
          <h1>토론해요</h1>
          <p className="sparring-intro__title">누구 말이 맞을까?</p>
          <p className="sparring-intro__description">내 생각을 고르고, 한마디를 보태보세요.</p>
          <Button
            className="sparring-create-trigger"
            size="lg"
            onClick={() => requireMember(() => setCreating(true))}
            disabled={auth.status === "loading"}
            data-ph-capture-attribute-action="sparring_create"
          >
            <SparringCreateIcon /> 토론 만들기
          </Button>
        </div>
      </header>
      <div className="sparring-tools">
        <div className="sparring-search">
          <Search aria-hidden="true" size={19} />
          <label className="sparring-sr-only" htmlFor="sparring-search">
            토론 주제 검색
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
      {query.isPending && <p role="status">열린 토론을 불러오고 있어요.</p>}
      {query.isError && (
        <div role="alert">
          <p>토론을 불러오지 못했어요.</p>
          <Button
            onClick={() => query.refetch()}
            data-ph-capture-attribute-action="sparring_list_retry"
          >
            다시 불러오기
          </Button>
        </div>
      )}
      {topics.length > 0 && (
            <section className="sparring-featured" aria-label="진행 중인 토론">
              <div className="sparring-carousel-controls" aria-label="진행 중인 토론 이동">
                <button type="button" aria-label="이전 토론" disabled={scrollEdges.start} onClick={() => moveCarousel(-1)} data-ph-capture-attribute-action="sparring_carousel_previous"><ChevronLeft size={19} aria-hidden="true" /></button>
                <button type="button" aria-label="다음 토론" disabled={scrollEdges.end && !query.hasNextPage} onClick={() => moveCarousel(1)} data-ph-capture-attribute-action="sparring_carousel_next"><ChevronRight size={19} aria-hidden="true" /></button>
              </div>
              <div className="sparring-featured-grid" ref={carouselRef} onScroll={handleCarouselScroll}>
                {topics.map((topic, index) => {
                  const totalVotes = topic.votesA + topic.votesB;
                  const percentA = totalVotes ? Math.round((100 * topic.votesA) / totalVotes) : null;
                  const deadline = remainingDeadline(topic.closesAt, now);
                  const voteSummary = totalVotes
                    ? `${topic.a} ${percentA}%, ${topic.b} ${100 - percentA}%, ${topic.votesA === topic.votesB ? "동률" : `${topic.votesA > topic.votesB ? topic.a : topic.b} 우세`}`
                    : "아직 투표가 없어요";
                  return (
                  <Link
                    key={topic.id}
                    className="sparring-featured-card"
                    to={`/sparring/${topic.id}`}
                    aria-label={`${topic.title}, ${deadline}, ${voteSummary}`}
                    data-ph-capture-attribute-action="sparring_join"
                  >
                    <img src={topic.representativeImageUrl || (index % 2 === 0 ? rivalClash : rivalLift)} alt="" />
                    <div className="sparring-featured-card__content">
                      <h3>{topic.title}</h3>
                      <p className="sparring-featured-card__deadline">{deadline}</p>
                    </div>
                    <div className="sparring-featured-card__footer">
                      {totalVotes ? (
                        <div className="sparring-vote-summary" aria-hidden="true">
                          <div className="sparring-vote-summary__labels">
                            <span><span className="sparring-vote-summary__name">{topic.a}</span> <strong>{percentA}%</strong>{topic.votesA >= topic.votesB && <b>{topic.votesA === topic.votesB ? "동률" : "우세"}</b>}</span>
                            <span><span className="sparring-vote-summary__name">{topic.b}</span> <strong>{100 - percentA}%</strong>{topic.votesB > topic.votesA && <b>우세</b>}</span>
                          </div>
                          <div className="sparring-vote-summary__bar"><span style={{ width: `${percentA}%` }} /></div>
                        </div>
                      ) : <p className="sparring-vote-summary__empty">{topic.a} · {topic.b} <span>아직 투표가 없어요</span></p>}
                      <div className="sparring-featured-card__meta">
                        <span>투표 {totalVotes} · 한마디 {topic.postCount}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
              {query.hasNextPage && (
                <Button pending={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} data-ph-capture-attribute-action="sparring_list_more">진행 중인 토론 더 보기</Button>
              )}
            </section>
      )}
      {query.isSuccess && !topics.length && <p className="sparring-list-empty">{search ? "진행 중인 검색 결과가 없어요." : "진행 중인 토론이 없어요."}</p>}
      <section className="sparring-topics" aria-labelledby="sparring-topics-title">
            <div className="sparring-section-heading">
              <h2 id="sparring-topics-title">마감된 토론</h2>
            </div>
            <ul className="sparring-topic-list" aria-label="토론 주제">
              {closedTopics.map((topic, index) => {
                const totalVotes = topic.votesA + topic.votesB;
                const percentA = totalVotes ? Math.round((100 * topic.votesA) / totalVotes) : null;
                return (
                  <li key={topic.id}>
                    <Link
                      className="sparring-topic-row"
                      to={`/sparring/${topic.id}`}
                      aria-label={topic.title}
                      aria-describedby={`sparring-result-${topic.id}`}
                      data-ph-capture-attribute-action="sparring_join"
                    >
                      <img className="sparring-topic-row__image" src={topic.representativeImageUrl || (index % 2 === 0 ? rivalClash : rivalLift)} alt="" />
                      <span className="sparring-topic-row__scrim" aria-hidden="true" />
                      <StatusBadge className="sparring-topic-row__badge" placement="overlay" tone="ended">마감</StatusBadge>
                      <div className="sparring-topic-row__body">
                        <div className="sparring-topic-row__details">
                        <h3>{topic.title}</h3>
                        <div className="sparring-topic-row__meta">
                          <span><Users size={15} aria-hidden="true" /> 투표 {totalVotes}</span>
                          <span><MessageCircle size={15} aria-hidden="true" /> 한마디 {topic.postCount}</span>
                        </div>
                        </div>
                        <div className="sparring-topic-row__result" id={`sparring-result-${topic.id}`}>
                          <div className="sparring-topic-row__choices">
                            <span className="sparring-topic-row__choice sparring-topic-row__choice--mint">
                              {topic.a}{percentA !== null && <strong>{percentA}%</strong>}
                            </span>
                            <span className="sparring-topic-row__vs" aria-hidden="true">VS</span>
                            <span className="sparring-topic-row__choice sparring-topic-row__choice--coral">
                              {topic.b}{percentA !== null && <strong>{100 - percentA}%</strong>}
                            </span>
                          </div>
                          {percentA !== null ? (
                            <div className="sparring-vote-summary__bar" aria-hidden="true"><span style={{ width: `${percentA}%` }} /></div>
                          ) : <p className="sparring-topic-row__empty">투표 없이 마감됐어요</p>}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          {closedQuery.isPending && <p role="status">마감된 토론을 불러오고 있어요.</p>}
          {closedQuery.isError && <div role="alert"><p>마감된 토론을 불러오지 못했어요.</p><Button onClick={() => closedQuery.refetch()} data-ph-capture-attribute-action="sparring_list_retry">다시 불러오기</Button></div>}
          {closedQuery.isSuccess && !closedTopics.length && <p className="sparring-list-empty">마감된 토론이 없어요.</p>}
          {closedQuery.hasNextPage && <Button pending={closedQuery.isFetchingNextPage} onClick={() => closedQuery.fetchNextPage()} data-ph-capture-attribute-action="sparring_list_more">마감된 토론 더 보기</Button>}
          </section>
      <CreateSparring open={creating} onClose={() => setCreating(false)} />
    </PageContainer>
  );
}
