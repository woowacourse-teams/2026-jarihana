import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { useAuth, storeReturnTarget } from "../../features/auth/index.js";
import {
  useCreateActivityPost,
  useDeleteActivityPost,
  useInfiniteActivityPosts,
  useModifyActivityPost
} from "../../features/activity-post/hooks.js";
import { fetchGroups } from "../../features/group/api.js";
import { groupKeys } from "../../features/group/hooks.js";
import { toUserMessage } from "../../shared/api/index.js";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  Skeleton
} from "../../shared/ui/index.js";
import { useToast } from "../../shared/ui/Toast.jsx";
import { useInfiniteScroll } from "../account/useInfiniteScroll.js";
import { ActivityPostComposer } from "./ActivityPostComposer.jsx";
import { calculateActivityPhotoWallLayout } from "./activity-photo-wall-layout.js";
import "./activity-posts.css";

const ACTIVE_GROUP_FILTERS = Object.freeze({ relation: "JOINED", status: "ACTIVE", size: 100 });
const LONG_PRESS_DURATION_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD_PX = 12;
const SUPPRESS_CLICK_DURATION_MS = 1000;

function formatActivityDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function ActivityPostCard({ layout, onDelete, onEdit, onImageLoad, post }) {
  const destination = `/groups/${post.group.id}?tab=activities`;
  const [actionsVisible, setActionsVisible] = useState(false);
  const cardRef = useRef(null);
  const firstActionRef = useRef(null);
  const pressTimerRef = useRef(null);
  const suppressClickTimerRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const pressStartRef = useRef(null);
  const focusActionsOnOpenRef = useRef(false);

  useEffect(() => () => {
    window.clearTimeout(pressTimerRef.current);
    window.clearTimeout(suppressClickTimerRef.current);
  }, []);

  useEffect(() => {
    if (!actionsVisible) {
      return undefined;
    }

    function dismissWhenClickingOutside(event) {
      if (!cardRef.current?.contains(event.target)) {
        setActionsVisible(false);
      }
    }

    function dismissOnEscape(event) {
      if (event.key === "Escape") {
        setActionsVisible(false);
        cardRef.current?.querySelector("a")?.focus();
      }
    }

    function dismissOnScroll() {
      setActionsVisible(false);
    }

    document.addEventListener("pointerdown", dismissWhenClickingOutside);
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("scroll", dismissOnScroll, true);
    window.addEventListener("scroll", dismissOnScroll);
    return () => {
      document.removeEventListener("pointerdown", dismissWhenClickingOutside);
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("scroll", dismissOnScroll, true);
      window.removeEventListener("scroll", dismissOnScroll);
    };
  }, [actionsVisible]);

  useEffect(() => {
    if (!actionsVisible || !focusActionsOnOpenRef.current) {
      return;
    }

    focusActionsOnOpenRef.current = false;
    if (post.canModify) {
      firstActionRef.current?.focus();
    }
  }, [actionsVisible, post.canModify]);

  function toggleActions({ focus = false } = {}) {
    if (!post.canModify) {
      return;
    }

    focusActionsOnOpenRef.current = focus && !actionsVisible;
    setActionsVisible(!actionsVisible);
  }

  function showActions() {
    if (!post.canModify) {
      return;
    }

    setActionsVisible(true);
  }

  function startLongPress(event) {
    if (event.pointerType !== "touch" || !event.isPrimary || event.button !== 0) {
      return;
    }

    pressStartRef.current = { x: event.clientX, y: event.clientY };
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true;
      showActions();
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, SUPPRESS_CLICK_DURATION_MS);
    }, LONG_PRESS_DURATION_MS);
  }

  function moveLongPress(event) {
    if (!pressStartRef.current || pressTimerRef.current === null) {
      return;
    }

    const movedX = Math.abs(event.clientX - pressStartRef.current.x);
    const movedY = Math.abs(event.clientY - pressStartRef.current.y);
    if (movedX > LONG_PRESS_MOVE_THRESHOLD_PX || movedY > LONG_PRESS_MOVE_THRESHOLD_PX) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function endLongPress() {
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    pressStartRef.current = null;
  }

  function openActionsFromKeyboard(event) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      toggleActions({ focus: true });
    }
  }

  function suppressNavigationAfterLongPress(event) {
    if (!suppressNextClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressNextClickRef.current = false;
    window.clearTimeout(suppressClickTimerRef.current);
  }

  return (
    <article
      className="activity-photo-card"
      ref={cardRef}
      style={layout ? {
        left: layout.left,
        position: "absolute",
        top: layout.top,
        width: layout.width
      } : undefined}
    >
      <Link
        className="activity-photo-card__link"
        data-ph-capture-attribute-action="activity_post_open_group"
        onClick={suppressNavigationAfterLongPress}
        onContextMenu={(event) => {
          event.preventDefault();
          if (event.button === 2 && !suppressNextClickRef.current) {
            toggleActions();
            return;
          }
          showActions();
        }}
        onKeyDown={openActionsFromKeyboard}
        onPointerCancel={endLongPress}
        onPointerDown={startLongPress}
        onPointerMove={moveLongPress}
        onPointerUp={endLongPress}
        to={destination}
      >
        <figure className="activity-photo-card__paper">
          <img
            alt={`${post.group.name} 활동 사진`}
            className="activity-photo-card__image"
            decoding="async"
            loading="lazy"
            onLoad={onImageLoad}
            src={post.imageUrl}
          />
          <figcaption className="activity-photo-card__caption">
            {post.caption ? <span className="activity-photo-card__note">{post.caption}</span> : null}
            <span className="activity-photo-card__byline-row">
              <span className="activity-photo-card__byline">{post.group.name}</span>
              <time className="activity-photo-card__date" dateTime={post.activityDate}>
                {formatActivityDate(post.activityDate)}
              </time>
            </span>
            {post.group.status === "ENDED" ? (
              <span className="activity-photo-card__archive">아카이브</span>
            ) : null}
          </figcaption>
        </figure>
      </Link>
      {actionsVisible && post.canModify ? (
        <div aria-label={`${post.group.name} 기록 관리`} className="activity-photo-card__actions" role="group">
          <Button
            data-ph-capture-attribute-action="activity_post_edit_start"
            onClick={() => onEdit(post)}
            ref={firstActionRef}
            size="sm"
            variant="tertiary"
          >
            <Pencil aria-hidden="true" size={14} /> 수정
          </Button>
          <Button
            data-ph-capture-attribute-action="activity_post_delete_start"
            onClick={() => onDelete(post)}
            size="sm"
            variant="tertiary"
          >
            <Trash2 aria-hidden="true" size={14} /> 내리기
          </Button>
        </div>
      ) : null}
    </article>
  );
}

const FALLBACK_ACTIVITY_CARD_HEIGHT = 360;

function areLayoutsEqual(previous, next) {
  if (!previous || previous.height !== next.height || previous.positions.length !== next.positions.length) {
    return false;
  }
  return previous.positions.every((position, index) => {
    const nextPosition = next.positions[index];
    return position.left === nextPosition.left &&
      position.top === nextPosition.top &&
      position.width === nextPosition.width;
  });
}

function ActivityPhotoWall({ busy, onDelete, onEdit, posts, scopeKey }) {
  const wallRef = useRef(null);
  const measureRef = useRef(null);
  const measuredContentHeightsRef = useRef(new Map());
  const layoutContextRef = useRef({ columnAssignments: [], columnCount: null, postIds: [], scopeKey: null });
  const [layout, setLayout] = useState(null);
  const postsSignature = JSON.stringify(posts.map((post) => [
    post.id,
    post.imageUrl,
    post.caption,
    post.activityDate,
    post.group.name,
    post.group.status
  ]));
  const scheduleLayout = useCallback(() => measureRef.current?.(), []);

  useLayoutEffect(() => {
    const wall = wallRef.current;
    if (!wall) return undefined;

    const postIds = JSON.parse(postsSignature).map(([id]) => id);
    let animationFrame = null;
    const requestFrame = window.requestAnimationFrame ?? ((callback) => window.setTimeout(callback, 0));
    const cancelFrame = window.cancelAnimationFrame ?? window.clearTimeout;

    function updateLayout() {
      const cards = Array.from(wall.querySelectorAll(":scope > .activity-photo-card"));
      const wallWidth = wall.clientWidth || wall.getBoundingClientRect().width;
      if (cards.length === 0 || wallWidth <= 0) return;

      const styles = window.getComputedStyle(wall);
      const columnCount = styles.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length || 1;
      const columnGap = Number.parseFloat(styles.columnGap) || 0;
      const rowGap = Number.parseFloat(styles.rowGap) || 0;
      const cardHeights = cards.map((card) => card.offsetHeight || FALLBACK_ACTIVITY_CARD_HEIGHT);
      const contentHeights = cards.map((card, index) => (
        card.querySelector(".activity-photo-card__paper")?.offsetHeight ||
        cardHeights[index]
      ));
      const firstChangedHeightIndex = contentHeights.findIndex((height, index) => {
        const previousHeight = measuredContentHeightsRef.current.get(postIds[index]);
        return previousHeight !== undefined && previousHeight !== height;
      });
      const previousContext = layoutContextRef.current;
      const canKeepAssignments = previousContext.scopeKey === scopeKey &&
        previousContext.columnCount === columnCount &&
        previousContext.postIds.length <= postIds.length &&
        previousContext.postIds.every((id, index) => id === postIds[index]);
      // A card's own column depends on earlier cards, not its own height. Keep the stable prefix,
      // then repack the suffix when an image finishes loading or responsive text changes height.
      const repackFromIndex = firstChangedHeightIndex < 0
        ? postIds.length
        : firstChangedHeightIndex + 1;
      const preferredColumnIndexes = canKeepAssignments
        ? postIds.map((_, index) => (
          index < repackFromIndex ? previousContext.columnAssignments[index] : undefined
        ))
        : [];
      const nextLayout = calculateActivityPhotoWallLayout({
        cardHeights,
        columnCount,
        columnGap,
        preferredColumnIndexes,
        rowGap,
        wallWidth
      });

      layoutContextRef.current = {
        columnAssignments: nextLayout.columnAssignments,
        columnCount,
        postIds,
        scopeKey
      };
      measuredContentHeightsRef.current = new Map(postIds.map((id, index) => [id, contentHeights[index]]));
      setLayout((previous) => areLayoutsEqual(previous, nextLayout) ? previous : nextLayout);
    }

    function scheduleUpdate() {
      if (animationFrame !== null) return;
      animationFrame = requestFrame(() => {
        animationFrame = null;
        updateLayout();
      });
    }

    measureRef.current = scheduleUpdate;
    updateLayout();

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(wall);
      wall.querySelectorAll(":scope > .activity-photo-card").forEach((card) => observer.observe(card));
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== null) cancelFrame(animationFrame);
      measureRef.current = null;
    };
  }, [postsSignature, scopeKey]);

  return (
    <div
      aria-busy={busy || undefined}
      aria-label="활동 사진 게시판"
      className="activity-photo-wall"
      ref={wallRef}
      style={layout ? { height: layout.height } : undefined}
    >
      {posts.map((post, index) => (
        <ActivityPostCard
          key={post.id}
          layout={layout?.positions[index]}
          onDelete={onDelete}
          onEdit={onEdit}
          onImageLoad={scheduleLayout}
          post={post}
        />
      ))}
    </div>
  );
}

function ActivityPostFilters({ mine, onSelectMine, onSelectPublic }) {
  return (
    <div
      aria-label="활동 기록 범위"
      className="activity-post-filters"
      data-active={mine ? "mine" : "all"}
      role="tablist"
    >
      <span aria-hidden="true" className="activity-post-filters__indicator" />
      <button
        aria-selected={!mine}
        className={!mine ? "activity-post-filters__tab is-active" : "activity-post-filters__tab"}
        data-ph-capture-attribute-action="activity_posts_filter_all"
        onClick={onSelectPublic}
        role="tab"
        type="button"
      >
        전체 기록
      </button>
      <button
        aria-selected={mine}
        className={mine ? "activity-post-filters__tab is-active" : "activity-post-filters__tab"}
        data-ph-capture-attribute-action="activity_posts_filter_mine"
        onClick={onSelectMine}
        role="tab"
        type="button"
      >
        내가 쓴 기록
      </button>
    </div>
  );
}

export function ActivityPostBoard({ group = null }) {
  const isGlobal = !group;
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const mine = searchParams.get("mine") === "true";
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSession, setComposerSession] = useState(0);
  const [editingPost, setEditingPost] = useState(null);
  const [deletingPost, setDeletingPost] = useState(null);
  const isAuthenticated = auth.status === "authenticated" || auth.isAuthenticated;
  const viewerKey = isAuthenticated ? auth.member?.id ?? "authenticated" : auth.status;
  const postsQuery = useInfiniteActivityPosts({ groupId: group?.id, mine, viewerKey });
  const createMutation = useCreateActivityPost();
  const modifyMutation = useModifyActivityPost();
  const deleteMutation = useDeleteActivityPost();
  const groupsQuery = useInfiniteQuery({
    queryKey: groupKeys.list(ACTIVE_GROUP_FILTERS),
    enabled: isGlobal && composerOpen && Boolean(isAuthenticated),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchGroups({ ...ACTIVE_GROUP_FILTERS, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor
  });
  const groups = groupsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const hasPreviousFeed = Boolean(postsQuery.isPlaceholderData);
  const hasNextPage = Boolean(postsQuery.hasNextPage) && !hasPreviousFeed;
  const isRefreshingFeed = postsQuery.isFetching && !postsQuery.isLoading && !postsQuery.isFetchingNextPage;
  const sentinelReference = useInfiniteScroll({
    hasNext: hasNextPage,
    onLoadMore: () => postsQuery.fetchNextPage(),
    pending: Boolean(postsQuery.isFetchingNextPage)
  });

  function openLogin(target) {
    storeReturnTarget(target);
    if (auth.status === "signup-required") {
      navigate("/signup");
      return;
    }
    auth.login?.();
  }

  function chooseMine(nextMine) {
    if (nextMine && !isAuthenticated) {
      const target = new URLSearchParams(searchParams);
      target.set("mine", "true");
      openLogin(`${window.location.pathname}?${target.toString()}`);
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (nextMine) next.set("mine", "true");
    else next.delete("mine");
    setSearchParams(next, { replace: true });
  }

  function startCreate() {
    if (!isAuthenticated) {
      openLogin(isGlobal ? "/activities" : `${window.location.pathname}?tab=activities`);
      return;
    }
    setComposerSession((session) => session + 1);
    setEditingPost(null);
    setComposerOpen(true);
  }

  function startEdit(post) {
    setComposerSession((session) => session + 1);
    setEditingPost(post);
    setComposerOpen(true);
  }

  async function savePost(values) {
    try {
      if (values.postId) {
        await modifyMutation.mutateAsync({
          postId: values.postId,
          values: {
            ...(values.imageKey ? { imageKey: values.imageKey } : {}),
            caption: values.caption,
            activityDate: values.activityDate
          }
        });
        toast.show({ title: "활동 기록을 수정했어요.", tone: "success" });
      } else {
        await createMutation.mutateAsync({
          groupId: values.groupId,
          values: {
            imageKey: values.imageKey,
            caption: values.caption,
            activityDate: values.activityDate
          }
        });
        toast.show({ title: "활동 기록을 공개했어요.", tone: "success" });
      }
    } catch (error) {
      toast.show({
        title: values.postId ? "활동 기록을 수정하지 못했어요." : "활동 기록을 공개하지 못했어요.",
        description: toUserMessage(error?.code),
        tone: "danger"
      });
      throw error;
    }
  }

  async function deletePost() {
    if (!deletingPost) return;
    await deleteMutation.mutateAsync({ postId: deletingPost.id });
    toast.show({ title: "활동 기록을 목록에서 내렸어요.", tone: "success" });
    setDeletingPost(null);
  }

  const canCreateInGroup =
    group?.status === "ACTIVE" &&
    isAuthenticated &&
    (group.currentMemberRole === "MEMBER" || group.currentMemberRole === "LEADER");
  const action = isGlobal ? (
    isAuthenticated || auth.status !== "loading" ? (
      <Button
        className="activity-post-board__create-button"
        data-ph-capture-attribute-action={isAuthenticated ? "activity_post_create_start" : "activity_post_login_to_create"}
        onClick={startCreate}
        size="sm"
      >
        <Camera aria-hidden="true" /> 활동 올리기
      </Button>
    ) : null
  ) : canCreateInGroup ? (
    <Button
      data-ph-capture-attribute-action="activity_post_create_start"
      onClick={startCreate}
    >
      <Camera aria-hidden="true" size={17} /> 사진 기록 남기기
    </Button>
  ) : null;
  const groupLoginAction =
    group && !isAuthenticated && auth.status !== "loading" && group.status === "ACTIVE" ? (
      <Button
        data-ph-capture-attribute-action="activity_post_login_to_create"
        onClick={startCreate}
        variant="secondary"
      >
        로그인하고 사진 기록 남기기
      </Button>
    ) : null;

  const content = (
    <>
      <div className="activity-post-board__toolbar">
        <ActivityPostFilters
          mine={mine}
          onSelectMine={() => chooseMine(true)}
          onSelectPublic={() => chooseMine(false)}
        />
        {isRefreshingFeed ? (
          <p className="activity-post-board__refresh" role="status">
            활동 기록을 불러오는 중…
          </p>
        ) : null}
        {group && !canCreateInGroup && auth.status === "authenticated" && group.status === "ACTIVE" ? (
          <p className="activity-post-board__membership-note">그룹 구성원만 기록을 남길 수 있어요.</p>
        ) : null}
        {groupLoginAction}
      </div>

      {postsQuery.isLoading ? (
        <div aria-label="활동 기록 불러오는 중" className="activity-photo-wall activity-photo-wall--loading" role="status">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="activity-photo-wall__skeleton" key={index} />
          ))}
        </div>
      ) : null}
      {!postsQuery.isLoading && postsQuery.isError ? (
        <ErrorState
          action={<Button onClick={() => postsQuery.refetch()}>다시 시도</Button>}
          description="연결을 확인하고 다시 시도해 주세요."
          title="활동 기록을 불러오지 못했어요"
        />
      ) : null}
      {!postsQuery.isLoading && !postsQuery.isError && posts.length > 0 ? (
        <>
          <ActivityPhotoWall
            busy={isRefreshingFeed}
            key={viewerKey}
            onDelete={setDeletingPost}
            onEdit={startEdit}
            posts={posts}
            scopeKey={group ? `group:${group.id}` : mine ? "mine" : "all"}
          />
          {postsQuery.isFetchingNextPage ? (
            <div
              aria-label="다음 활동 기록 불러오는 중"
              className="activity-photo-wall activity-photo-wall--loading activity-photo-wall--next-page"
              role="status"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton className="activity-photo-wall__skeleton" key={index} />
              ))}
            </div>
          ) : null}
          <div className="activity-post-board__sentinel" ref={sentinelReference}>
            {hasNextPage || hasPreviousFeed ? null : <span>모든 활동 기록을 확인했어요.</span>}
          </div>
        </>
      ) : null}
      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <EmptyState
          action={isGlobal ? undefined : canCreateInGroup ? action : groupLoginAction ?? undefined}
          description={
            mine
              ? "아직 내가 남긴 사진 기록이 없어요."
              : "모임의 순간을 사진으로 기록해 첫 게시글을 남겨 보세요."
          }
          title={mine ? "내 활동 기록이 없어요" : "아직 사진 기록이 없어요"}
        />
      ) : null}
    </>
  );

  return (
    <>
      {isGlobal ? (
        <PageContainer className="activity-posts-page">
          <PageHeader
            action={action}
            title="활동 기록"
          />
          {content}
        </PageContainer>
      ) : (
        <section aria-label={`${group.name} 활동 기록`} className="activity-post-board">
          {content}
        </section>
      )}

      <ActivityPostComposer
        key={composerSession}
        fixedGroup={group}
        groups={groups}
        groupsError={groupsQuery.isError}
        groupsHasNext={Boolean(groupsQuery.hasNextPage)}
        groupsLoading={groupsQuery.isFetching}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        onLoadMoreGroups={() => groupsQuery.fetchNextPage()}
        onSave={savePost}
        open={composerOpen}
        post={editingPost}
        savePending={createMutation.isPending || modifyMutation.isPending}
      />
      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="기록 내리기"
        danger
        description="이 사진 기록은 공개 게시판에서 숨겨져요."
        onClose={() => setDeletingPost(null)}
        onConfirm={deletePost}
        onConfirmError={(error) => {
          toast.show({
            title: "활동 기록을 내리지 못했어요.",
            description: toUserMessage(error?.code),
            tone: "danger"
          });
        }}
        open={Boolean(deletingPost)}
        title="활동 기록을 내릴까요?"
      />
    </>
  );
}

export function ActivityPostsPage() {
  return <ActivityPostBoard />;
}
