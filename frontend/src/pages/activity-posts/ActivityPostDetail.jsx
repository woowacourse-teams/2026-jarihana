import { useEffect, useId, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { Link } from "react-router";

import { ACTIVITY_COMMENT_MAX_LENGTH, describeActivityReactors } from "../../entities/activity-post/index.js";
import {
  useCreateActivityComment,
  useDeleteActivityComment,
  useInfiniteActivityComments,
  useInfiniteActivityReactors,
  useToggleActivityReaction
} from "../../features/activity-post/hooks.js";
import { toUserMessage } from "../../shared/api/index.js";
import { Avatar, Button, Modal, Skeleton } from "../../shared/ui/index.js";
import { useToast } from "../../shared/ui/Toast.jsx";
import { ActivityReactionBar } from "./ActivityReactionBar.jsx";
import { ActivityReactorList } from "./ActivityReactorList.jsx";

const GROUP_TYPE_LABELS = Object.freeze({ CLUB: "동아리", SESSION: "세션", STUDY: "스터디" });
const SWIPE_CLOSE_DISTANCE_PX = 100;
const SWIPE_TAB_DISTANCE_PX = 56;
// activity-posts.css의 모바일 전체 화면 상세와 같은 기준이다.
const COMPACT_LAYOUT_QUERY = "(max-width: 39.9375rem)";
const NO_REACTORS_TEXT = "아직 하트를 남긴 사람이 없어요.";

function useCompactLayout() {
  const [compact, setCompact] = useState(() => Boolean(window.matchMedia?.(COMPACT_LAYOUT_QUERY)?.matches));

  useEffect(() => {
    const media = window.matchMedia?.(COMPACT_LAYOUT_QUERY);
    if (!media) return undefined;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return compact;
}

export function formatActivityDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

export function formatCommentTime(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatActivityDate(createdAt.slice(0, 10));
}

function GroupRow({ group, onNavigate }) {
  const ended = group.status === "ENDED";
  const invite = !ended && !group.joined && group.recruiting;
  const destination = ended ? `/groups/${group.id}?tab=activities` : `/groups/${group.id}`;
  return (
    <Link
      className={invite ? "activity-detail-group activity-detail-group--invite" : "activity-detail-group"}
      data-ph-capture-attribute-action="activity_post_detail_group_open"
      onClick={onNavigate}
      to={destination}
    >
      <span className={`activity-detail-group__type activity-detail-group__type--${group.type.toLowerCase()}`}>
        {GROUP_TYPE_LABELS[group.type]}
      </span>
      <span className="activity-detail-group__name">{group.name}</span>
      {ended ? <span className="activity-detail-group__state">종료된 모임</span> : null}
      {invite ? <span className="activity-detail-group__state activity-detail-group__state--open">모집 중</span> : null}
      <span className="activity-detail-group__go">
        {ended ? "기록 보기 ›" : invite ? "모임 둘러보기" : "모임 보기 ›"}
      </span>
    </Link>
  );
}

function PhotoViewer({ onClose, post }) {
  const viewerRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // 크게 보기만 닫고 상세 다이얼로그는 남기도록 Escape와 아래로 쓸기를 이 요소에서 처리한다.
  useEffect(() => {
    const viewer = viewerRef.current;
    closeRef.current?.focus();
    let startY = null;
    let offset = 0;
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    }
    function startSwipe(event) {
      if (event.pointerType === "mouse" || !event.isPrimary) return;
      startY = event.clientY;
    }
    function moveSwipe(event) {
      if (startY === null) return;
      offset = Math.max(0, event.clientY - startY);
      setDragOffset(offset);
    }
    function endSwipe() {
      if (startY === null) return;
      startY = null;
      if (offset > SWIPE_CLOSE_DISTANCE_PX) {
        onCloseRef.current();
        return;
      }
      offset = 0;
      setDragOffset(0);
    }
    viewer.addEventListener("keydown", closeOnEscape);
    viewer.addEventListener("pointerdown", startSwipe);
    viewer.addEventListener("pointermove", moveSwipe);
    viewer.addEventListener("pointerup", endSwipe);
    viewer.addEventListener("pointercancel", endSwipe);
    return () => {
      viewer.removeEventListener("keydown", closeOnEscape);
      viewer.removeEventListener("pointerdown", startSwipe);
      viewer.removeEventListener("pointermove", moveSwipe);
      viewer.removeEventListener("pointerup", endSwipe);
      viewer.removeEventListener("pointercancel", endSwipe);
    };
  }, []);

  return (
    <div
      aria-label="사진 크게 보기"
      aria-modal="true"
      className="activity-photo-viewer"
      ref={viewerRef}
      role="dialog"
      style={dragOffset ? { opacity: 1 - Math.min(dragOffset / 400, 0.6), transform: `translateY(${dragOffset}px)` } : undefined}
    >
      <button
        aria-hidden="true"
        className="activity-photo-viewer__backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <button
        aria-label="크게 보기 닫기"
        className="activity-photo-viewer__close"
        data-ph-capture-attribute-action="activity_post_photo_zoom_dismiss"
        onClick={onClose}
        ref={closeRef}
        type="button"
      >
        <X aria-hidden="true" size={22} />
      </button>
      <img alt={`${post.group.name} 활동 사진`} className="activity-photo-viewer__image" src={post.imageUrl} />
      <div className="activity-photo-viewer__caption">
        <strong>{post.group.name}</strong>
        {post.caption ? <span>{post.caption}</span> : null}
        <span className="activity-photo-viewer__meta">
          <span>{post.authorNickname}</span>
          <time dateTime={post.activityDate}>{formatActivityDate(post.activityDate)}</time>
        </span>
      </div>
    </div>
  );
}

function CommentList({ onRequireLogin, onToggleReaction, post, signedIn, viewerKey, viewerRelation }) {
  const toast = useToast();
  const commentsQuery = useInfiniteActivityComments({ postId: post.id, viewerKey });
  const deleteMutation = useDeleteActivityComment();
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function removeComment(comment) {
    try {
      await deleteMutation.mutateAsync({ commentId: comment.id, post, viewerRelation });
      toast.show({ title: "댓글을 지웠어요.", tone: "success" });
    } catch (error) {
      toast.show({ title: "댓글을 지우지 못했어요.", description: toUserMessage(error?.code), tone: "danger" });
    }
  }

  if (commentsQuery.isLoading) {
    return (
      <div aria-label="댓글 불러오는 중" className="activity-comments activity-comments--loading" role="status">
        <Skeleton className="activity-comments__skeleton" />
        <Skeleton className="activity-comments__skeleton" />
      </div>
    );
  }
  if (commentsQuery.isError) {
    return (
      <div className="activity-comments activity-comments--error">
        <p>댓글을 불러오지 못했어요.</p>
        <Button
          data-ph-capture-attribute-action="activity_comment_list_retry"
          onClick={() => commentsQuery.refetch()}
          size="sm"
          variant="secondary"
        >
          다시 시도
        </Button>
      </div>
    );
  }
  if (comments.length === 0) {
    return <p className="activity-comments activity-comments--empty">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>;
  }
  return (
    <div className="activity-comments">
      <ul aria-label="댓글" className="activity-comments__list">
        {comments.map((comment) => (
          <li className="activity-comment" key={comment.id}>
            <Avatar
              className="activity-comment__avatar"
              fallback={comment.authorNickname.charAt(0)}
              size="sm"
              src={comment.authorAvatarUrl}
            />
            <div className="activity-comment__body">
              <p className="activity-comment__meta">
                <strong>{comment.authorNickname}</strong>
                <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
                {comment.canDelete ? (
                  <button
                    aria-label={`${comment.authorNickname}님의 댓글 지우기`}
                    className="activity-comment__delete"
                    data-ph-capture-attribute-action="activity_comment_delete"
                    disabled={deleteMutation.isPending}
                    onClick={() => void removeComment(comment)}
                    type="button"
                  >
                    지우기
                  </button>
                ) : null}
              </p>
              <p className="activity-comment__content">{comment.content}</p>
              <ActivityReactionBar
                label={`${comment.authorNickname}님의 댓글 반응`}
                onRequireLogin={onRequireLogin}
                onToggle={(emoji, reacted) =>
                  onToggleReaction({ id: comment.id, type: "comment" }, emoji, reacted)
                }
                reactions={comment.reactions}
                signedIn={signedIn}
                size="sm"
                target={{ id: comment.id, type: "comment" }}
                viewerKey={viewerKey}
              />
            </div>
          </li>
        ))}
      </ul>
      {commentsQuery.hasNextPage ? (
        <Button
          data-ph-capture-attribute-action="activity_comment_load_more"
          disabled={commentsQuery.isFetchingNextPage}
          onClick={() => commentsQuery.fetchNextPage()}
          size="sm"
          variant="tertiary"
        >
          {commentsQuery.isFetchingNextPage ? "댓글 불러오는 중…" : "댓글 더 보기"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 데스크톱에서 하트 옆 요약을 누르면 그 아래에 여는 좋아요 목록이다. 바깥을 누르거나 Escape로 닫고,
 * Escape는 상세 다이얼로그까지 닫히지 않도록 여기서 멈춘다.
 */
function ReactorPopover({ onClose, query, total }) {
  const popoverRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const popover = popoverRef.current;
    // 오른쪽 패널 아래로 넘치면 잘리므로, 카드 전체가 보이도록 패널을 필요한 만큼만 내린다.
    popover?.focus({ preventScroll: true });
    popover?.scrollIntoView?.({ block: "nearest" });
    function closeWhenOutside(event) {
      if (popover?.contains(event.target) || event.target.closest?.("[data-reactors-trigger]")) return;
      onCloseRef.current();
    }
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current({ restoreFocus: true });
    }
    document.addEventListener("pointerdown", closeWhenOutside);
    popover?.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      popover?.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <section aria-label="좋아요한 사람" className="activity-reactors-popover" ref={popoverRef} tabIndex={-1}>
      <div className="activity-reactors-popover__header">
        <h4>
          좋아요 <span>{total}</span>명
        </h4>
        <button
          aria-label="좋아요한 사람 닫기"
          className="activity-reactors-popover__close"
          data-ph-capture-attribute-action="activity_reactors_close"
          onClick={() => onClose({ restoreFocus: true })}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="activity-reactors-popover__body">
        <ActivityReactorList emptyText={NO_REACTORS_TEXT} query={query} />
      </div>
    </section>
  );
}

function CommentComposer({ onRequireLogin, onSubmitted, post, signedIn, viewerRelation }) {
  const toast = useToast();
  const createMutation = useCreateActivityComment();
  const [content, setContent] = useState("");
  const trimmed = content.trim();

  if (!signedIn) {
    return (
      <div className="activity-comment-composer">
        <Button
          className="activity-comment-composer__login"
          data-ph-capture-attribute-action="activity_comment_login_to_write"
          onClick={onRequireLogin}
          variant="secondary"
        >
          로그인하고 댓글 남기기
        </Button>
      </div>
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!trimmed || createMutation.isPending) return;
    try {
      await createMutation.mutateAsync({ content: trimmed, post, viewerRelation });
      setContent("");
      onSubmitted();
    } catch (error) {
      toast.show({ title: "댓글을 남기지 못했어요.", description: toUserMessage(error?.code), tone: "danger" });
    }
  }

  return (
    <form className="activity-comment-composer" data-ph-capture-attribute-action="activity_comment_form" onSubmit={submit}>
      <label className="ui-sr-only" htmlFor={`activity-comment-${post.id}`}>
        댓글
      </label>
      <input
        autoComplete="off"
        className="activity-comment-composer__input"
        data-ph-capture-attribute-action="activity_comment_input"
        id={`activity-comment-${post.id}`}
        maxLength={ACTIVITY_COMMENT_MAX_LENGTH}
        onChange={(event) => setContent(event.target.value)}
        placeholder="댓글을 남겨 주세요"
        value={content}
      />
      <Button
        data-ph-capture-attribute-action="activity_comment_submit"
        disabled={!trimmed || createMutation.isPending}
        size="sm"
        type="submit"
      >
        등록
      </Button>
    </form>
  );
}

/**
 * 사진 활동 기록 상세(가운데 다이얼로그). 데스크톱은 왼쪽 사진, 오른쪽 대화이고 모바일은 전체 화면이다.
 */
export function ActivityPostDetail({ onClose, onNavigateGroup, onRequireLogin, post, signedIn, viewerKey }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [tab, setTab] = useState("comments");
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const photoButtonRef = useRef(null);
  const scrollRef = useRef(null);
  const reactorsTriggerRef = useRef(null);
  const swipeStartRef = useRef(null);
  const ids = useId();
  const compact = useCompactLayout();
  const toggleReaction = useToggleActivityReaction();
  const viewerRelation = signedIn ? (post.group.joined ? "member" : "non_member") : "anonymous";
  const requireLogin = () => onRequireLogin(post);
  const heartCount = post.reactions.find((reaction) => reaction.emoji === "HEART")?.count ?? 0;
  const reactorsQuery = useInfiniteActivityReactors({
    target: { id: post.id, type: "post" },
    emoji: "HEART",
    viewerKey,
    enabled: heartCount > 0
  });
  const firstReactorPage = reactorsQuery.data?.pages[0];
  const reactorSummary = heartCount > 0 && firstReactorPage ? describeActivityReactors(firstReactorPage, "하트", 2) : null;
  const showLikes = compact && tab === "likes";
  const tabIds = {
    comments: `${ids}-comments-tab`,
    commentsPanel: `${ids}-comments-panel`,
    likes: `${ids}-likes-tab`,
    likesPanel: `${ids}-likes-panel`
  };

  function closeReactors({ restoreFocus = false } = {}) {
    setReactorsOpen(false);
    if (restoreFocus) reactorsTriggerRef.current?.focus();
  }

  // 모바일은 좋아요 탭으로 넘기고, 데스크톱은 하트 아래에 목록을 연다.
  function openReactors() {
    if (compact) {
      setTab("likes");
      return;
    }
    setReactorsOpen((open) => !open);
  }

  // 모바일 탭 영역을 좌우로 쓸면 댓글과 좋아요를 오간다. 세로 스크롤은 그대로 둔다.
  function startSwipe(event) {
    if (event.pointerType === "mouse") return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function endSwipe(event) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_TAB_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setTab(dx < 0 ? "likes" : "comments");
  }

  function closePhoto() {
    setPhotoOpen(false);
    photoButtonRef.current?.focus();
  }

  function closeDetail() {
    // Escape가 크게 보기에서 시작되지 않은 경우에도 크게 보기부터 닫는다.
    if (photoOpen) {
      closePhoto();
      return;
    }
    if (reactorsOpen) {
      closeReactors({ restoreFocus: true });
      return;
    }
    onClose();
  }

  function onToggleReaction(target, emoji, reacted) {
    return toggleReaction.mutateAsync({ emoji, post, reacted, target, viewerRelation });
  }

  return (
    <Modal
      closeAction="activity_post_detail_dismiss"
      onClose={closeDetail}
      open
      panelClassName="activity-post-detail"
      title={post.group.name}
    >
      <div className="activity-post-detail__photo">
        <button
          aria-label="사진 크게 보기"
          className="activity-post-detail__photo-button"
          data-ph-capture-attribute-action="activity_post_photo_zoom"
          onClick={() => setPhotoOpen(true)}
          ref={photoButtonRef}
          type="button"
        >
          <img alt={`${post.group.name} 활동 사진`} className="activity-post-detail__image" src={post.imageUrl} />
          <span aria-hidden="true" className="activity-post-detail__zoom-hint">
            <Maximize2 size={14} />
          </span>
        </button>
      </div>
      <div className="activity-post-detail__side">
        <div className="activity-post-detail__scroll" ref={scrollRef}>
          <div className="activity-post-detail__story">
            {post.caption ? <p className="activity-post-detail__caption">{post.caption}</p> : null}
            <p className="activity-post-detail__meta">
              <span>{post.authorNickname}</span>
              <time dateTime={post.activityDate}>{formatActivityDate(post.activityDate)}</time>
            </p>
          </div>
          <GroupRow group={post.group} onNavigate={onNavigateGroup} />
          <div className="activity-post-detail__reactions">
            <ActivityReactionBar
              label="활동 기록 반응"
              onRequireLogin={requireLogin}
              onToggle={(emoji, reacted) => onToggleReaction({ id: post.id, type: "post" }, emoji, reacted)}
              reactions={post.reactions}
              signedIn={signedIn}
              target={{ id: post.id, type: "post" }}
              viewerKey={viewerKey}
            />
            {reactorSummary ? (
              <button
                aria-controls={compact ? tabIds.likesPanel : undefined}
                aria-expanded={compact ? undefined : reactorsOpen}
                className="activity-reactors-summary"
                data-ph-capture-attribute-action="activity_reactors_open"
                data-reactors-trigger=""
                onClick={openReactors}
                ref={reactorsTriggerRef}
                type="button"
              >
                {reactorSummary}
              </button>
            ) : null}
            {reactorsOpen && !compact ? (
              <ReactorPopover onClose={closeReactors} query={reactorsQuery} total={heartCount} />
            ) : null}
          </div>
          {compact ? (
            <div aria-label="댓글과 좋아요" className="activity-post-detail__tabs" role="tablist">
              <button
                aria-controls={tabIds.commentsPanel}
                aria-selected={tab === "comments"}
                className="activity-post-detail__tab"
                data-ph-capture-attribute-action="activity_post_comments_tab_open"
                id={tabIds.comments}
                onClick={() => setTab("comments")}
                role="tab"
                type="button"
              >
                댓글 <span>{post.commentCount}</span>
              </button>
              <button
                aria-controls={tabIds.likesPanel}
                aria-selected={tab === "likes"}
                className="activity-post-detail__tab"
                data-ph-capture-attribute-action="activity_post_likes_tab_open"
                id={tabIds.likes}
                onClick={() => setTab("likes")}
                role="tab"
                type="button"
              >
                좋아요 <span>{heartCount}</span>
              </button>
            </div>
          ) : null}
          <div
            className="activity-post-detail__panels"
            onPointerCancel={() => {
              swipeStartRef.current = null;
            }}
            onPointerDown={compact ? startSwipe : undefined}
            onPointerUp={compact ? endSwipe : undefined}
          >
            <section
              aria-label={compact ? undefined : "댓글"}
              aria-labelledby={compact ? tabIds.comments : undefined}
              className="activity-post-detail__comments"
              hidden={showLikes}
              id={tabIds.commentsPanel}
              role={compact ? "tabpanel" : undefined}
            >
              {compact ? null : (
                <h3 className="activity-post-detail__comments-title">
                  댓글 <span>{post.commentCount}</span>
                </h3>
              )}
              <CommentList
                onRequireLogin={requireLogin}
                onToggleReaction={onToggleReaction}
                post={post}
                signedIn={signedIn}
                viewerKey={viewerKey}
                viewerRelation={viewerRelation}
              />
            </section>
            {compact ? (
              <section
                aria-labelledby={tabIds.likes}
                className="activity-post-detail__likes"
                hidden={!showLikes}
                id={tabIds.likesPanel}
                role="tabpanel"
              >
                <ActivityReactorList emptyText={NO_REACTORS_TEXT} query={reactorsQuery} />
              </section>
            ) : null}
          </div>
        </div>
        {showLikes ? null : (
          <CommentComposer
            onRequireLogin={requireLogin}
            onSubmitted={() => {
              const scroller = scrollRef.current;
              if (scroller) scroller.scrollTop = scroller.scrollHeight;
            }}
            post={post}
            signedIn={signedIn}
            viewerRelation={viewerRelation}
          />
        )}
      </div>
      {photoOpen ? <PhotoViewer onClose={closePhoto} post={post} /> : null}
    </Modal>
  );
}
