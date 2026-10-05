import { ArrowRight, CalendarDays, Search, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useInfiniteGroups } from "../../../features/group/index.js";
import createChairImage from "../../../shared/assets/brand/jarihana-chair-create.png";
import rainbowChairsImage from "../../../shared/assets/brand/jarihana-chairs-rainbow.png";
import { Button, EmptyState, ErrorState, GroupImage, Skeleton } from "../../../shared/ui/index.js";
import { GroupDetailLink } from "../GroupTransition.jsx";
import { flattenPages, publicErrorCopy, typeLabel } from "../pageUtils.js";
import { ExploreHero } from "./ExploreHero.jsx";
import { groupScheduleLabel, groupSeatsLabel } from "./groupCardMetadata.js";
import "./reference-home.css";

const types = [
  { label: "전체", value: "" },
  { label: "같이해요", value: "SESSION" },
  { label: "스터디", value: "STUDY" },
  { label: "동아리", value: "CLUB" }
];

function RecruitingCard({ group, featured }) {
  const seats = groupSeatsLabel(group);
  return (
    <GroupDetailLink
      className={`reference-group-card${featured ? " reference-group-card--featured" : ""}`}
      data-ph-capture-attribute-action="group_view"
      groupId={group.id}
      source="recruiting"
    >
      <span className="reference-group-card__visual">
        <span className="group-card-transition-image" data-group-transition-image>
          <GroupImage alt="" className="reference-group-card__image" group={group} loading="lazy" />
        </span>
        <span className="reference-group-card__badge">모집 중</span>
      </span>
      <div className="reference-group-card__body">
        <h3>{group.name}</h3>
        <p className="reference-group-card__introduction">{group.introduction}</p>
        <span className="reference-group-card__schedule">
          <CalendarDays aria-hidden="true" size={14} />
          <span>{groupScheduleLabel(group)}</span>
        </span>
        <span className="reference-group-card__members">
          <Users aria-hidden="true" size={14} />
          {group.memberCount}명 함께하는 중
        </span>
        <span className="reference-group-card__footer">
          <span className="reference-group-card__type">{typeLabel(group.type)}</span>
          {seats && <span className="reference-group-card__seats">{seats}</span>}
          {featured && <ArrowRight aria-hidden="true" size={20} />}
        </span>
      </div>
    </GroupDetailLink>
  );
}

export function RecruitingSection({ beforeResults, headline, heroPeriod, isAuthenticated = false }) {
  const resultsRef = useRef(null);
  const actionsRef = useRef(null);
  const [motionPaused, setMotionPaused] = useState(true);
  const [params, setParams] = useSearchParams();
  const keyword = params.get("homeKeyword")?.trim() || "";
  const type = types.some((option) => option.value === params.get("homeType"))
    ? params.get("homeType") || ""
    : "";
  const [draft, setDraft] = useState({ keyword, value: keyword });
  const searchValue = draft.keyword === keyword ? draft.value : keyword;

  useEffect(() => {
    let inView = !window.IntersectionObserver;
    const updateMotion = () => setMotionPaused(!inView || document.hidden);
    const observer = window.IntersectionObserver
      ? new IntersectionObserver(([entry]) => {
          inView = entry.isIntersecting;
          updateMotion();
        })
      : null;

    observer?.observe(actionsRef.current);
    document.addEventListener("visibilitychange", updateMotion);
    updateMotion();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", updateMotion);
    };
  }, []);

  const query = useInfiniteGroups({
    status: "ACTIVE",
    recruiting: true,
    type: type || undefined,
    keyword: keyword || undefined,
    size: 4
  });
  const groups = flattenPages(query.data);
  const visibleGroups = groups.slice(0, 4);
  const error = publicErrorCopy(query.error, "모집 중인 모임");
  const browseParams = new URLSearchParams({ status: "ACTIVE", recruiting: "true" });
  if (type) browseParams.set("type", type);
  if (keyword) browseParams.set("keyword", keyword);

  function updateFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  function scrollToResults() {
    resultsRef.current?.scrollIntoView?.({
      block: "start",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth"
    });
  }

  return (
    <>
      <ExploreHero headline={headline} period={heroPeriod} isAuthenticated={isAuthenticated}>
        <div
          className="reference-hero__actions"
          data-motion-paused={motionPaused}
          ref={actionsRef}
        >
          <Link
            className="ui-button ui-button--primary ui-button--lg reference-hero__seat"
            data-ph-capture-attribute-action="group_browse"
            to="/groups"
          >
            <span aria-hidden="true" className="reference-hero__chairs">
              <img
                alt=""
                className="reference-hero__chair"
                height="40"
                src={rainbowChairsImage}
                width="56"
              />
            </span>
            <span className="reference-hero__action-label">자리하기</span>
          </Link>
          <Link
            className="ui-button ui-button--primary ui-button--lg reference-hero__create"
            data-ph-capture-attribute-action="group_create"
            to="/groups/new"
          >
            <span aria-hidden="true" className="reference-hero__create-mark">
              <img
                alt=""
                className="reference-hero__create-chair"
                height="40"
                src={createChairImage}
                width="40"
              />
            </span>
            <span className="reference-hero__action-label">자리 만들기</span>
          </Link>
        </div>
      </ExploreHero>
      {beforeResults}
      <section
        aria-labelledby="reference-recruiting-title"
        className="reference-discovery"
        ref={resultsRef}
      >
        <div className="reference-section-heading">
          <h2 id="reference-recruiting-title">지금 모집 중인 모임</h2>
          <Link
            aria-label="모집 중인 모임 더 보기"
            className="reference-browse-link"
            data-ph-capture-attribute-action="home_discovery_browse"
            to={`/groups?${browseParams}`}
          >
            모집 중인 모임 더 보기 <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
        <div className="reference-discovery-tools">
          <form
            aria-label="모임 검색"
            className="reference-search groups-search"
            data-ph-capture-attribute-action="home_discovery_search_form"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter("homeKeyword", searchValue.trim());
              scrollToResults();
            }}
            role="search"
          >
            <label className="ui-sr-only" htmlFor="reference-group-search">
              모임 검색
            </label>
            <div className="groups-search__control">
              <input
                data-ph-capture-attribute-action="home_discovery_search_input"
                id="reference-group-search"
                onChange={(event) => setDraft({ keyword, value: event.target.value })}
                placeholder="어떤 모임을 찾고 있나요?"
                type="search"
                value={searchValue}
              />
              <button
                aria-label="검색"
                className="groups-search__submit"
                data-ph-capture-attribute-action="home_discovery_search_submit"
                type="submit"
              >
                <Search aria-hidden="true" size={18} />
              </button>
            </div>
          </form>
          <div aria-label="모임 유형" className="reference-type-filters" role="group">
            {types.map((option) => (
              <button
                aria-pressed={type === option.value}
                data-ph-capture-attribute-action="home_discovery_type_change"
                key={option.value}
                onClick={() => {
                  updateFilter("homeType", option.value);
                  scrollToResults();
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {query.isLoading && (
          <div aria-label="모집 중인 모임을 불러오는 중" className="reference-recruiting-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="reference-card-skeleton" key={index} />
            ))}
          </div>
        )}
        {query.isError && (
          <ErrorState
            title={error.title}
            description={error.description}
            action={
              <Button
                data-ph-capture-attribute-action="home_discovery_retry"
                onClick={() => query.refetch()}
              >
                다시 시도
              </Button>
            }
          />
        )}
        {!query.isLoading && !query.isError && groups.length === 0 && (
          <EmptyState
            title="모집 중인 모임이 아직 없어요"
            description={
              keyword || type
                ? "검색어나 모임 유형을 바꿔 둘러보세요."
                : "새로운 자리가 열리면 이곳에서 만날 수 있어요."
            }
            showMark={false}
          />
        )}
        {groups.length > 0 && (
          <div
            aria-busy={query.isFetching && !query.isFetchingNextPage}
            className="reference-recruiting-grid"
          >
            {visibleGroups.map((group, index) => (
              <RecruitingCard featured={index === 0} group={group} key={group.id} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
