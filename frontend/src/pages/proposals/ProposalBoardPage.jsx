import { Hand, MessageCircle, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import {
  formatProposalTime,
  PROPOSAL_CATEGORIES,
  proposalCategoryLabel
} from "../../entities/proposal/index.js";
import { useInfiniteProposals, useToggleProposalInterest } from "../../features/proposal/hooks.js";
import { toUserMessage } from "../../shared/api/index.js";
import createChairImage from "../../shared/assets/brand/jarihana-chair-create.png";
import { Button, EmptyState, ErrorState, PageContainer, Skeleton } from "../../shared/ui/index.js";
import { useToast } from "../../shared/ui/Toast.jsx";
import { useInfiniteScroll } from "../account/useInfiniteScroll.js";
import { ProposalCategoryIcon } from "./ProposalCategoryIcon.jsx";
import { useProposalViewer } from "./proposalAuth.js";
import "./proposals.css";

const CATEGORY_CODES = new Set(PROPOSAL_CATEGORIES.map((category) => category.code));
const GUIDE_STEPS = Object.freeze(["마음이 가는 제안 열기", "가능한 조건 골라 보내기", "조건이 모이면 모임으로"]);

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
          <span>모임 제안</span>
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
          <span className="proposal-card__time">{formatProposalTime(proposal.createdAt)}</span>
        </div>
      </article>
    </li>
  );
}

function ProposalGuide() {
  return (
    <aside aria-labelledby="proposal-guide-title" className="proposal-guide">
      <p className="proposal-eyebrow">이렇게 모여요</p>
      <h2 className="proposal-guide__title" id="proposal-guide-title">
        괜찮은 생각 하나,
        <br />
        모임이 될 수 있어요.
      </h2>
      <ol className="proposal-guide__steps">
        {GUIDE_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="proposal-note">모임 신청이 아니라 함께할 가능성을 알아보는 단계예요.</p>
    </aside>
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
    <PageContainer className="proposal-page">
      <section aria-labelledby="proposal-board-title" className="proposal-hero">
        <p className="proposal-eyebrow">작은 생각이 모임이 되는 곳</p>
        <h1 className="proposal-hero__title" id="proposal-board-title">
          이런 모임,
          <br />
          같이할 사람?
        </h1>
        <p className="proposal-hero__lead">아직은 작은 생각이어도 좋아요. 함께할 마음부터 모아 봐요.</p>
        <img alt="" aria-hidden="true" className="proposal-hero__chair" src={createChairImage} />
      </section>

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
        <Link
          className="ui-button ui-button--primary ui-button--md proposal-bar__create"
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
          <span>모임 제안하기</span>
        </Link>
      </div>

      <div className="proposal-layout">
        <section aria-label="모임 제안 목록" className="proposal-layout__main">
          {renderList()}
        </section>
        <ProposalGuide />
      </div>
    </PageContainer>
  );
}
