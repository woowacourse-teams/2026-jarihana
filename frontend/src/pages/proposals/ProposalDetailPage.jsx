import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Hand, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import {
  formatProposalTime,
  hasInterestConditions,
  PROPOSAL_COMMENT_MAX_LENGTH,
  PROPOSAL_MEETING_MODES,
  PROPOSAL_TIME_SLOTS,
  proposalCategoryLabel,
  proposalMeetingModeLabel,
  proposalTimeSlotLabel
} from "../../entities/proposal/index.js";
import {
  useCreateProposalComment,
  useDeleteProposal,
  useDeleteProposalComment,
  useInfiniteProposalComments,
  useProposal,
  useRemoveProposalInterest,
  useSaveProposalInterest
} from "../../features/proposal/hooks.js";
import { toUserMessage } from "../../shared/api/index.js";
import {
  Avatar,
  Button,
  ConfirmDialog,
  ErrorState,
  NotFoundState,
  PageContainer,
  Skeleton,
  Textarea
} from "../../shared/ui/index.js";
import { useToast } from "../../shared/ui/Toast.jsx";
import { useProposalViewer } from "./proposalAuth.js";
import "./proposals.css";

const EMPTY_DRAFT = Object.freeze({ meetingModes: [], moodIndexes: [], timeSlots: [] });

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function orderedDraft(draft) {
  const timeOrder = PROPOSAL_TIME_SLOTS.map((item) => item.code);
  const modeOrder = PROPOSAL_MEETING_MODES.map((item) => item.code);
  return {
    meetingModes: [...draft.meetingModes].sort((left, right) => modeOrder.indexOf(left) - modeOrder.indexOf(right)),
    moodIndexes: [...draft.moodIndexes].sort((left, right) => left - right),
    timeSlots: [...draft.timeSlots].sort((left, right) => timeOrder.indexOf(left) - timeOrder.indexOf(right))
  };
}

function ConditionChips({ label, onToggle, options, selected }) {
  return (
    <fieldset className="proposal-chips">
      <legend className="proposal-chips__label">
        {label}
        <span>여러 개 가능</span>
      </legend>
      <div className="proposal-chips__list">
        {options.map((option) => {
          const pressed = selected.includes(option.value);
          return (
            <button
              aria-pressed={pressed}
              className="proposal-chip"
              data-ph-capture-attribute-action="proposal_condition_select"
              key={option.value}
              onClick={() => onToggle(option.value)}
              type="button"
            >
              {pressed ? <Check aria-hidden="true" size={14} /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function myInterestLines(proposal) {
  const interest = proposal.myInterest;
  const lines = [];
  if (interest.timeSlots.length) lines.push(["시간", interest.timeSlots.map(proposalTimeSlotLabel).join(", ")]);
  if (interest.meetingModes.length) {
    lines.push(["방식", interest.meetingModes.map(proposalMeetingModeLabel).join(", ")]);
  }
  if (interest.moodIndexes.length) {
    lines.push(["분위기", interest.moodIndexes.map((index) => proposal.moodOptions[index]).filter(Boolean).join(", ")]);
  }
  return lines;
}

function InterestPanel({ proposal, viewer }) {
  const toast = useToast();
  const saveInterest = useSaveProposalInterest();
  const removeInterest = useRemoveProposalInterest();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const responded = Boolean(proposal.myInterest);

  if (!viewer.isAuthenticated) {
    return (
      <div className="proposal-panel">
        <p className="proposal-eyebrow">함께할 조건</p>
        <h2 className="proposal-panel__title">어떤 모임이면 함께할까요?</h2>
        <p className="proposal-panel__desc">로그인하면 함께하고 싶어요와 가능한 조건을 남길 수 있어요.</p>
        <Button
          block
          data-ph-capture-attribute-action="proposal_login_to_interest"
          disabled={viewer.status === "loading"}
          onClick={() => viewer.openLogin()}
        >
          로그인하고 함께하기
        </Button>
      </div>
    );
  }

  if (responded && !editing) {
    const lines = myInterestLines(proposal);
    const withConditions = hasInterestConditions(proposal.myInterest);
    return (
      <div className="proposal-panel">
        <p className="proposal-eyebrow proposal-eyebrow--done">
          <Check aria-hidden="true" size={14} />
          함께하고 싶어요를 보냈어요
        </p>
        <h2 className="proposal-panel__title">{withConditions ? "내 응답" : "조건도 알려 주실래요?"}</h2>
        {withConditions ? (
          <dl className="proposal-mine">
            {lines.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="proposal-panel__desc">
            조건 없이 마음만 보냈어요. 가능한 시간과 방식을 더하면 제안자가 모임 모습을 정하기 쉬워져요.
          </p>
        )}
        <div className="proposal-panel__row">
          <Button
            data-ph-capture-attribute-action="proposal_interest_edit"
            onClick={() => {
              setDraft(proposal.myInterest);
              setEditing(true);
            }}
            variant="secondary"
          >
            {withConditions ? "응답 고치기" : "조건 더하기"}
          </Button>
          <Button
            data-ph-capture-attribute-action="proposal_interest_cancel"
            onClick={() =>
              removeInterest.mutate(
                { proposalId: proposal.id },
                {
                  onError: (error) =>
                    toast.show({
                      description: toUserMessage(error?.code),
                      title: "응답을 취소하지 못했어요.",
                      tone: "danger"
                    }),
                  onSuccess: () => toast.show({ title: "응답을 취소했어요.", tone: "success" })
                }
              )
            }
            pending={removeInterest.isPending}
            variant="tertiary"
          >
            응답 취소
          </Button>
        </div>
      </div>
    );
  }

  const values = orderedDraft(draft);
  const empty = !hasInterestConditions(values);

  function submit() {
    saveInterest.mutate(
      { conditions: values, proposalId: proposal.id },
      {
        onError: (error) =>
          toast.show({
            description: toUserMessage(error?.code),
            title: "응답을 보내지 못했어요.",
            tone: "danger"
          }),
        onSuccess: () => {
          setEditing(false);
          toast.show({
            title: responded ? "응답을 고쳤어요." : "응답을 보냈어요. 모인 조건에 더해졌어요.",
            tone: "success"
          });
        }
      }
    );
  }

  return (
    <div className="proposal-panel">
      <p className="proposal-eyebrow">{editing ? "응답 고치기" : "함께할 조건"}</p>
      <h2 className="proposal-panel__title">어떤 모임이면 함께할까요?</h2>
      <p className="proposal-panel__desc">조건은 비워 두어도 괜찮아요. 마음만 보내도 돼요.</p>
      <ConditionChips
        label="가능한 시간"
        onToggle={(value) => setDraft((current) => ({ ...current, timeSlots: toggleValue(current.timeSlots, value) }))}
        options={PROPOSAL_TIME_SLOTS.map((item) => ({ label: item.label, value: item.code }))}
        selected={draft.timeSlots}
      />
      <ConditionChips
        label="진행 방식"
        onToggle={(value) =>
          setDraft((current) => ({ ...current, meetingModes: toggleValue(current.meetingModes, value) }))
        }
        options={PROPOSAL_MEETING_MODES.map((item) => ({ label: item.label, value: item.code }))}
        selected={draft.meetingModes}
      />
      {proposal.moodOptions.length ? (
        <ConditionChips
          label="함께 기대하는 분위기"
          onToggle={(value) =>
            setDraft((current) => ({ ...current, moodIndexes: toggleValue(current.moodIndexes, value) }))
          }
          options={proposal.moodOptions.map((label, index) => ({ label, value: index }))}
          selected={draft.moodIndexes}
        />
      ) : null}
      <div className="proposal-panel__cta">
        <Button
          block
          data-ph-capture-attribute-action="proposal_interest_submit"
          onClick={submit}
          pending={saveInterest.isPending}
          size="lg"
        >
          <Hand aria-hidden="true" size={18} />
          {empty ? "조건 없이 함께하고 싶어요" : "이 조건이면 함께할래요"}
        </Button>
        <p className="proposal-note">모임 신청이 아니라 함께할 가능성을 알아보는 응답이에요.</p>
        {editing ? (
          <Button
            data-ph-capture-attribute-action="proposal_interest_edit_cancel"
            onClick={() => setEditing(false)}
            variant="tertiary"
          >
            고치지 않고 돌아가기
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CountBars({ counts, mine, title, total }) {
  const max = Math.max(0, ...counts.map((item) => item.count));
  return (
    <div className="proposal-bars">
      <h3 className="proposal-bars__title">{title}</h3>
      <ul className="proposal-bars__list">
        {counts.map((item) => {
          const ratio = total > 0 ? Math.round((item.count / total) * 100) : 0;
          const lead = max > 0 && item.count === max;
          return (
            <li className={lead ? "proposal-bar-row proposal-bar-row--lead" : "proposal-bar-row"} key={item.key}>
              <span className="proposal-bar-row__label">
                {item.label}
                {mine.includes(item.key) ? <em>내 선택</em> : null}
              </span>
              <span aria-hidden="true" className="proposal-bar-row__track">
                <i style={{ inlineSize: `${ratio}%` }} />
              </span>
              <span className="proposal-bar-row__count">{item.count}명</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GatheredConditions({ proposal }) {
  const mine = proposal.myInterest ?? EMPTY_DRAFT;
  return (
    <section aria-labelledby="proposal-gathered-title" className="proposal-gathered">
      <p className="proposal-eyebrow">모인 조건</p>
      <h2 className="proposal-section-title" id="proposal-gathered-title">
        이런 조건이 잘 맞고 있어요
      </h2>
      <p className="proposal-gathered__desc">
        응답 {proposal.interestCount}명 기준이에요. 여러 개 고른 응답도 있고, 조건 없이 마음만 보낸 사람도 인원에 들어가요.
      </p>
      <CountBars
        counts={proposal.timeSlotCounts.map((item) => ({
          count: item.count,
          key: item.timeSlot,
          label: proposalTimeSlotLabel(item.timeSlot)
        }))}
        mine={mine.timeSlots}
        title="가능한 시간"
        total={proposal.interestCount}
      />
      <CountBars
        counts={proposal.meetingModeCounts.map((item) => ({
          count: item.count,
          key: item.meetingMode,
          label: proposalMeetingModeLabel(item.meetingMode)
        }))}
        mine={mine.meetingModes}
        title="진행 방식"
        total={proposal.interestCount}
      />
      {proposal.moodOptions.length ? (
        <CountBars
          counts={proposal.moodOptions.map((label, index) => ({
            count: proposal.moodCounts[index] ?? 0,
            key: index,
            label
          }))}
          mine={mine.moodIndexes}
          title="함께 기대하는 분위기"
          total={proposal.interestCount}
        />
      ) : null}
    </section>
  );
}

function ProposalComments({ proposal, viewer }) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const commentsQuery = useInfiniteProposalComments({ proposalId: proposal.id, viewerKey: viewer.viewerKey });
  const createComment = useCreateProposalComment();
  const deleteComment = useDeleteProposalComment();
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const trimmed = content.trim();

  function submit(event) {
    event.preventDefault();
    if (!trimmed) return;
    createComment.mutate(
      { content: trimmed, proposalId: proposal.id },
      {
        onError: (error) =>
          toast.show({
            description: toUserMessage(error?.code),
            title: "코멘트를 남기지 못했어요.",
            tone: "danger"
          }),
        onSuccess: () => {
          setContent("");
          toast.show({ title: "코멘트를 남겼어요.", tone: "success" });
        }
      }
    );
  }

  return (
    <section aria-labelledby="proposal-comments-title" className="proposal-comments">
      <h2 className="proposal-section-title" id="proposal-comments-title">
        함께 나눈 생각 <b>{proposal.commentCount}</b>
      </h2>
      {commentsQuery.isLoading ? <Skeleton aria-label="코멘트 불러오는 중" /> : null}
      {commentsQuery.isError ? (
        <div className="proposal-comments__error" role="alert">
          <p>코멘트를 불러오지 못했어요.</p>
          <Button
            data-ph-capture-attribute-action="proposal_comment_retry"
            onClick={() => commentsQuery.refetch()}
            size="sm"
            variant="secondary"
          >
            다시 불러오기
          </Button>
        </div>
      ) : null}
      {!commentsQuery.isLoading && !commentsQuery.isError && comments.length === 0 ? (
        <p className="proposal-note">아직 코멘트가 없어요. 원하는 조건이나 궁금한 점을 먼저 남겨 보세요.</p>
      ) : null}
      {comments.length ? (
        <ul className="proposal-comments__list">
          {comments.map((comment) => (
            <li className="proposal-comment" key={comment.id}>
              <Avatar
                alt=""
                fallback={comment.authorNickname.slice(0, 1)}
                size="sm"
                src={comment.authorAvatarUrl}
              />
              <div className="proposal-comment__body">
                <p className="proposal-comment__who">
                  <b>{comment.authorNickname}</b>
                  <span>{formatProposalTime(comment.createdAt)}</span>
                </p>
                <p className="proposal-comment__text">{comment.content}</p>
              </div>
              {comment.canDelete ? (
                <button
                  aria-label={`${comment.authorNickname}님의 코멘트 지우기`}
                  className="proposal-comment__delete"
                  data-ph-capture-attribute-action="proposal_comment_delete"
                  disabled={deleteComment.isPending}
                  onClick={() =>
                    deleteComment.mutate(
                      { commentId: comment.id, proposalId: proposal.id },
                      {
                        onError: (error) =>
                          toast.show({
                            description: toUserMessage(error?.code),
                            title: "코멘트를 지우지 못했어요.",
                            tone: "danger"
                          })
                      }
                    )
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {commentsQuery.hasNextPage ? (
        <Button
          data-ph-capture-attribute-action="proposal_comment_load_more"
          onClick={() => commentsQuery.fetchNextPage()}
          pending={commentsQuery.isFetchingNextPage}
          size="sm"
          variant="secondary"
        >
          코멘트 더 보기
        </Button>
      ) : null}
      {viewer.isAuthenticated ? (
        <form className="proposal-comment-form" data-ph-capture-attribute-action="proposal_comment_form" onSubmit={submit}>
          <Textarea
            data-ph-capture-attribute-action="proposal_comment_input"
            description={`${content.length} / ${PROPOSAL_COMMENT_MAX_LENGTH}`}
            label="함께하고 싶은 이유나 궁금한 점 (선택)"
            maxLength={PROPOSAL_COMMENT_MAX_LENGTH}
            onChange={(event) => setContent(event.target.value)}
            placeholder="예: 평일 저녁 8시 이후면 좋겠어요."
            rows={3}
            value={content}
          />
          <div className="proposal-comment-form__row">
            <Button
              data-ph-capture-attribute-action="proposal_comment_submit"
              disabled={!trimmed}
              pending={createComment.isPending}
              size="sm"
              type="submit"
            >
              코멘트 남기기
            </Button>
          </div>
        </form>
      ) : (
        <Button
          data-ph-capture-attribute-action="proposal_login_to_comment"
          disabled={viewer.status === "loading"}
          onClick={() => viewer.openLogin()}
          size="sm"
          variant="secondary"
        >
          로그인하고 코멘트 남기기
        </Button>
      )}
    </section>
  );
}

export function ProposalDetailPage() {
  const { proposalId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const viewer = useProposalViewer();
  const proposalQuery = useProposal(proposalId, viewer.viewerKey);
  const deleteProposal = useDeleteProposal();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef(null);
  const proposal = proposalQuery.data;
  const fromBoard = Boolean(location.state?.fromBoard);
  const boardPath = location.state?.search ? `/board?${location.state.search}` : "/board";

  useEffect(() => {
    if (proposal?.id) titleRef.current?.focus({ preventScroll: true });
  }, [proposal?.id]);

  function goBack(event) {
    // 목록에서 들어왔다면 뒤로 가서 보던 분야와 스크롤 위치를 그대로 되찾는다.
    if (fromBoard) {
      event.preventDefault();
      navigate(-1);
    }
  }

  if (proposalQuery.isLoading) {
    return (
      <PageContainer className="proposal-page">
        <Skeleton aria-label="모임 제안 불러오는 중" />
      </PageContainer>
    );
  }

  if (proposalQuery.isError || !proposal) {
    const notFound = proposalQuery.error?.code === "PROPOSAL_NOT_FOUND" || proposalQuery.error?.status === 404;
    return (
      <PageContainer className="proposal-page">
        {notFound ? (
          <NotFoundState
            action={
              <Link className="ui-button ui-button--secondary ui-button--md" data-ph-capture-attribute-action="proposal_back_to_board" to="/board">
                <span>자유게시판으로</span>
              </Link>
            }
            description="제안한 회원이 지웠거나 주소가 잘못되었어요."
            title="모임 제안을 찾을 수 없어요"
          />
        ) : (
          <ErrorState
            action={
              <Button
                data-ph-capture-attribute-action="proposal_detail_retry"
                onClick={() => proposalQuery.refetch()}
                variant="secondary"
              >
                다시 불러오기
              </Button>
            }
            description={toUserMessage(proposalQuery.error?.code)}
            title="모임 제안을 불러오지 못했어요"
          />
        )}
      </PageContainer>
    );
  }

  const paragraphs = proposal.content.split(/\n{2,}/);

  return (
    <PageContainer className="proposal-page proposal-detail">
      <nav aria-label="자유게시판 위치" className="proposal-detail__top">
        <Link
          className="proposal-back"
          data-ph-capture-attribute-action="proposal_back_to_board"
          onClick={goBack}
          to={boardPath}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          목록으로
        </Link>
        <span className="proposal-crumb">자유게시판 / {proposalCategoryLabel(proposal.category)} 모임 제안</span>
      </nav>

      <div className="proposal-detail__grid">
        <article className="proposal-detail__post">
          <span className={`proposal-badge proposal-badge--${proposal.category.toLowerCase()}`}>
            {proposalCategoryLabel(proposal.category)} 모임 제안
          </span>
          <h1 className="proposal-detail__title" ref={titleRef} tabIndex={-1}>
            {proposal.title}
          </h1>
          <div className="proposal-byline">
            <Avatar alt="" fallback={proposal.authorNickname.slice(0, 1)} size="sm" src={proposal.authorAvatarUrl} />
            <b>{proposal.authorNickname}</b>
            <span>{formatProposalTime(proposal.createdAt)} 제안했어요</span>
            {proposal.canDelete ? (
              <Button
                className="proposal-byline__delete"
                data-ph-capture-attribute-action="proposal_delete"
                onClick={() => setConfirmingDelete(true)}
                size="sm"
                variant="tertiary"
              >
                <Trash2 aria-hidden="true" size={15} />
                제안 지우기
              </Button>
            ) : null}
          </div>
          <div className="proposal-detail__content">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </article>

        <aside aria-label="함께하고 싶어요 응답" className="proposal-detail__side">
          {/* 다른 글이나 다른 계정으로 바뀌면 고치던 조건을 버리도록 새로 그린다. */}
          <InterestPanel key={`${proposal.id}-${viewer.viewerKey}`} proposal={proposal} viewer={viewer} />
        </aside>

        <div className="proposal-detail__gathered">
          <GatheredConditions proposal={proposal} />
        </div>

        <div className="proposal-detail__comments">
          <ProposalComments proposal={proposal} viewer={viewer} />
        </div>
      </div>

      <ConfirmDialog
        cancelAction="proposal_delete_cancel"
        closeAction="proposal_delete_close"
        confirmAction="proposal_delete_confirm"
        confirmLabel="제안 지우기"
        danger
        description="자유게시판 목록과 상세에서 이 제안이 사라져요."
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() =>
          deleteProposal.mutateAsync({ proposalId: proposal.id }).then(() => {
            toast.show({ title: "모임 제안을 지웠어요.", tone: "success" });
            navigate("/board", { replace: true });
          })
        }
        onConfirmError={(error) =>
          toast.show({
            description: toUserMessage(error?.code),
            title: "모임 제안을 지우지 못했어요.",
            tone: "danger"
          })
        }
        open={confirmingDelete}
        title="모임 제안을 지울까요?"
      />
    </PageContainer>
  );
}
