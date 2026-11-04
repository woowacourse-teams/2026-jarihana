import { useMemo, useState } from "react";
import { Link } from "react-router";

import { AnnouncementFormDialog } from "../../features/announcement/AnnouncementFormDialog.jsx";
import { useAnnouncementList } from "../../features/announcement/hooks.js";
import { useAuth } from "../../features/auth/index.js";
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton
} from "../../shared/ui/index.js";
import { formatCompactLocalDateTime } from "./pageUtils.js";
import "./announcements.css";

const SCOPE_LABELS = {
  MEMBERS: "모임원 공개",
  PUBLIC: "전체 공개"
};

function openCreateAction(setOpen) {
  return () => setOpen(true);
}

function AnnouncementRow({ announcement, groupId }) {
  return (
    <li className="group-announcement-list__item">
      <Link
        className="group-announcement-card"
        data-ph-capture-attribute-action="group_announcement_open"
        data-ph-private
        to={`/groups/${groupId}/announcements/${announcement.id}`}
      >
        <span className={`group-announcement-scope group-announcement-scope--${announcement.scope.toLowerCase()}`}>
          {SCOPE_LABELS[announcement.scope]}
        </span>
        <span className="group-announcement-card__title">{announcement.title}</span>
        <span className="group-announcement-card__meta">
          {announcement.authorNickname} · {formatCompactLocalDateTime(announcement.createdAt)}
        </span>
      </Link>
    </li>
  );
}

export function GroupAnnouncementTab({ group, isLeader }) {
  const auth = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const list = useAnnouncementList(
    group.id,
    auth.member?.id,
    auth.sessionVersion,
    auth.status !== "loading"
  );
  const announcements = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data]
  );
  const canCreate = isLeader && group.status !== "ENDED";
  const openCreate = openCreateAction(setCreateOpen);

  return (
    <section aria-label="모임 공지" className="group-announcement-tab">
      <div className="group-announcement-tab__header">
        <div>
          <h2>공지</h2>
          <p>모임 소식과 안내를 확인할 수 있어요.</p>
        </div>
        {canCreate ? (
          <Button
            data-ph-capture-attribute-action="group_announcement_create_open"
            onClick={openCreate}
            size="sm"
          >
            공지 추가
          </Button>
        ) : null}
      </div>
      {auth.status === "loading" || list.isLoading ? (
        <div aria-label="공지 불러오는 중" className="group-announcement-list-skeleton" role="status">
          <Skeleton count={3} />
        </div>
      ) : list.isError && !list.data ? (
        <ErrorState
          action={<Button data-ph-capture-attribute-action="group_announcement_list_retry" onClick={() => void list.refetch()} variant="secondary">다시 시도</Button>}
          description="연결 상태를 확인하고 다시 시도해 주세요."
          title="공지를 불러오지 못했어요"
        />
      ) : announcements.length === 0 ? (
        <EmptyState
          action={canCreate ? <Button data-ph-capture-attribute-action="group_announcement_create_open" onClick={openCreate}>공지 추가</Button> : undefined}
          description={canCreate ? "모임의 중요한 소식을 공지로 남겨 보세요." : "등록된 공지가 없어요."}
          title="아직 공지가 없어요"
        />
      ) : (
        <>
          <ul className="group-announcement-list">
            {announcements.map((announcement) => (
              <AnnouncementRow announcement={announcement} groupId={group.id} key={announcement.id} />
            ))}
          </ul>
          {list.isError ? (
            <div className="group-announcement-list__error" role="alert">
              <p>공지를 불러오지 못했어요. 다시 시도해 주세요.</p>
              <Button
                data-ph-capture-attribute-action="group_announcement_list_retry"
                onClick={() => void list.refetch()}
                size="sm"
                variant="secondary"
              >
                다시 시도
              </Button>
            </div>
          ) : null}
          {list.hasNextPage ? (
            <div className="group-announcement-list__more">
              <Button
                data-ph-capture-attribute-action="group_announcement_load_more"
                onClick={() => void list.fetchNextPage()}
                pending={list.isFetchingNextPage}
                variant="secondary"
              >
                더 보기
              </Button>
            </div>
          ) : null}
        </>
      )}
      {canCreate && createOpen ? (
        <AnnouncementFormDialog
          groupId={group.id}
          onOpenChange={setCreateOpen}
          open
        />
      ) : null}
    </section>
  );
}
