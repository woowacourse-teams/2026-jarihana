import { Hand, MessageCircle, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import {
  formatProposalTime,
  PROPOSAL_CATEGORIES,
  proposalCategoryLabel
} from "../../entities/proposal/index.js";
import { useInfiniteProposals, useToggleProposalInterest } from "../../features/proposal/hooks.js";
import { toUserMessage } from "../../shared/api/index.js";
import { Button, EmptyState, ErrorState, PageContainer, Skeleton } from "../../shared/ui/index.js";
import { useToast } from "../../shared/ui/Toast.jsx";
import { useInfiniteScroll } from "../account/useInfiniteScroll.js";
import { ProposalCategoryIcon } from "./ProposalCategoryIcon.jsx";
import { useProposalViewer } from "./proposalAuth.js";
import "./proposals.css";

const CATEGORY_CODES = new Set(PROPOSAL_CATEGORIES.map((category) => category.code));

function ProposalCard({ onToggleInterest, pending, proposal, returnSearch }) {
  return (
    <li className="proposal-card">
      <article className="proposal-card__body">
        <p className="proposal-card__meta">
          <span className={`proposal-badge proposal-badge--${proposal.category.toLowerCase()}`}>
            <ProposalCategoryIcon code={proposal.category} size={13} />
            {proposalCategoryLabel(proposal.category)}
          </span>
          <span className="proposal-card__author">{proposal.authorNickname}</span>
          <time className="proposal-card__time" dateTime={proposal.createdAt}>
            {formatProposalTime(proposal.createdAt)}
          </time>
        </p>
        <h2 className="proposal-card__title">
          <Link
            className="proposal-card__link"
            data-ph-capture-attribute-action="proposal_open"
            state={{ fromBoard: true, search: returnSearch }}
            to={`/board/${proposal.id}`}
          >
            {proposal.title}
          </Link>
        </h2>
        <p className="proposal-card__summary">{proposal.content}</p>
        <div className="proposal-card__foot">
          <button
            aria-pressed={proposal.interested}
            className={proposal.interested ? "proposal-pill proposal-pill--on" : "proposal-pill"}
            data-ph-capture-attribute-action="proposal_interest_toggle"
            disabled={pending}
            onClick={() => onToggleInterest(proposal)}
            type="button"
          >
            <Hand aria-hidden="true" size={16} />
            함께하고 싶어요
            <b>{proposal.interestCount}</b>
          </button>
          <span className="proposal-card__stat">
            <MessageCircle aria-hidden="true" size={15} />
            코멘트 {proposal.commentCount}
          </span>
        </div>
      </article>
    </li>
  );
}

function ProposalGuide() {
  return (
    <details className="proposal-guide">
      <summary data-ph-capture-attribute-action="proposal_guide_toggle">뭐할래? 이용 안내</summary>
      <p>같이 하고 싶은 일을 제안하고, 관심 있는 글에 ‘함께하고 싶어요’를 눌러 보세요.</p>
      <p>글을 열면 가능한 시간과 진행 방식도 고를 수 있어요. 관심을 보내도 모임에 바로 가입되지는 않아요.</p>
    </details>
  );
}

export function ProposalBoardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCategory = searchParams.get("category");
  const category = CATEGORY_CODES.has(requestedCategory) ? requestedCategory : null;
  const viewer = useProposalViewer();
  const toast = useToast();
  const proposalsQuery = useInfiniteProposals({ category, viewerKey: viewer.viewerKey });
  const toggleInterest = useToggleProposalInterest();
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = proposalsQuery;
  const sentinelRef = useInfiniteScroll({
    hasNext: Boolean(hasNextPage),
    onLoadMore: () => fetchNextPage(),
    pending: isFetchingNextPage
  });
  const proposals = proposalsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const categoryLabel = category ? proposalCategoryLabel(category) : null;

  function selectCategory(code) {
    const next = new URLSearchParams(searchParams);
    if (code) next.set("category", code);
    else next.delete("category");
    setSearchParams(next, { replace: true });
  }

  function handleToggleInterest(proposal) {
    if (!viewer.isAuthenticated) {
      viewer.openLogin();
      return;
    }
    toggleInterest.mutate(
      { interested: proposal.interested, proposalId: proposal.id },
      {
        onError: (error) =>
          toast.show({
            description: toUserMessage(error?.code),
            title: "함께하고 싶어요를 반영하지 못했어요.",
            tone: "danger"
          }),
        onSuccess: () =>
          toast.show({
            title: proposal.interested
              ? "함께하고 싶어요를 취소했어요."
              : "마음을 보냈어요. 조건은 글에서 더할 수 있어요.",
            tone: "success"
          })
      }
    );
  }

  function renderList() {
    if (proposalsQuery.isLoading) {
      return (
        <div className="proposal-cards" aria-busy="true">
          <Skeleton aria-label="모임 제안 불러오는 중" />
          <Skeleton />
        </div>
      );
    }
    if (proposalsQuery.isError) {
      return (
        <ErrorState
          action={
            <Button
              data-ph-capture-attribute-action="proposal_list_retry"
              onClick={() => proposalsQuery.refetch()}
              variant="secondary"
            >
              다시 불러오기
            </Button>
          }
          description={toUserMessage(proposalsQuery.error?.code)}
          title="모임 제안을 불러오지 못했어요"
        />
      );
    }
    if (proposals.length === 0) {
      return (
        <EmptyState
          description={
            categoryLabel ? "다른 분야를 둘러보거나 직접 제안해 보세요." : "생각해 둔 모임이 있다면 먼저 제안해 보세요."
          }
          title={categoryLabel ? `${categoryLabel} 분야에는 아직 제안이 없어요` : "아직 모임 제안이 없어요"}
        />
      );
    }
    return (
      <>
        <ul className="proposal-cards">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              onToggleInterest={handleToggleInterest}
              pending={toggleInterest.isPending && toggleInterest.variables?.proposalId === proposal.id}
              proposal={proposal}
              returnSearch={searchParams.toString()}
            />
          ))}
        </ul>
        <div aria-hidden="true" className="proposal-sentinel" ref={sentinelRef} />
        {hasNextPage ? (
          <div className="proposal-more">
            <Button
              data-ph-capture-attribute-action="proposal_list_load_more"
              onClick={() => fetchNextPage()}
              pending={isFetchingNextPage}
              variant="secondary"
            >
              제안 더 보기
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <PageContainer className="proposal-page proposal-board">
      <header className="proposal-board__header">
        <div>
          <h1 className="proposal-board__title">뭐할래?</h1>
          <p className="proposal-board__lead">같이 하고 싶은 일, 여기서 얘기해요.</p>
        </div>
        <Link
          className="ui-button ui-button--primary ui-button--md proposal-board__create"
          data-ph-capture-attribute-action="proposal_create_start"
          onClick={(event) => {
            if (!viewer.isAuthenticated) {
              event.preventDefault();
              viewer.openLogin("/board/new");
            }
          }}
          to="/board/new"
        >
          <Plus aria-hidden="true" size={16} />
          <span>제안하기</span>
        </Link>
      </header>

      <div className="proposal-bar">
        <div aria-label="분야" className="proposal-filters" role="group">
          <button
            aria-pressed={category === null}
            className="proposal-filter"
            data-ph-capture-attribute-action="proposal_category_filter"
            onClick={() => selectCategory(null)}
            type="button"
          >
            전체
          </button>
          {PROPOSAL_CATEGORIES.map((item) => (
            <button
              aria-pressed={category === item.code}
              className="proposal-filter"
              data-ph-capture-attribute-action="proposal_category_filter"
              key={item.code}
              onClick={() => selectCategory(item.code)}
              type="button"
            >
              <ProposalCategoryIcon code={item.code} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section aria-label="모임 제안 목록">
        {renderList()}
      </section>
      <ProposalGuide />
    </PageContainer>
  );
}
