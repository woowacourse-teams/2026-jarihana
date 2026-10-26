import { useMemo, useState } from "react";
import { Link } from "react-router";

import {
  useAnnouncementList,
  useCreateAnnouncement
} from "../../features/announcement/hooks.js";
import { useAuth } from "../../features/auth/index.js";
import { toUserMessage } from "../../shared/api/index.js";
import {
  Button,
  EmptyState,
  ErrorState,
  Modal,
  Radio,
  Skeleton,
  Textarea,
  TextField,
  useToast
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

function AnnouncementCreateForm({ groupId, open, onOpenChange }) {
  const create = useCreateAnnouncement(groupId);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState("MEMBERS");
  const [formError, setFormError] = useState("");

  function resetForm() {
    setTitle("");
    setContent("");
    setScope("MEMBERS");
    setFormError("");
    create.reset();
  }

  function closeForm() {
    resetForm();
    onOpenChange(false);
  }

  async function submit(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || cleanTitle.length > 100) {
      setFormError("제목은 1자 이상 100자 이하로 입력해 주세요.");
      return;
    }
    if (!cleanContent || cleanContent.length > 10000) {
      setFormError("내용은 1자 이상 10,000자 이하로 입력해 주세요.");
      return;
    }

    setFormError("");
    try {
      await create.mutateAsync({ title: cleanTitle, content: cleanContent, scope });
      closeForm();
      toast.success({ title: "공지를 등록했어요" });
    } catch (error) {
      setFormError(toUserMessage(error?.code));
    }
  }

  return (
    <Modal
      closeAction="group_announcement_create_dismiss"
      description="모임원에게 알림함으로 전달되며, 푸시 알림을 켠 모임원에게 알림을 보냅니다."
      dismissible={!create.isPending}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
      open={open}
      panelClassName="ui-dialog--group-announcement-create"
      title="공지 등록"
    >
      <form className="group-announcement-form" data-ph-private noValidate onSubmit={submit}>
        <TextField
          data-ph-capture-attribute-action="group_announcement_title_change"
          label="공지 제목"
          maxLength={100}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
          value={title}
        />
        <Textarea
          data-ph-capture-attribute-action="group_announcement_content_change"
          description="마크다운 없이 일반 텍스트로 입력해 주세요."
          label="공지 내용"
          maxLength={10000}
          onChange={(event) => setContent(event.currentTarget.value)}
          required
          rows={7}
          value={content}
        />
        <p className="group-announcement-form__count" aria-live="polite">
          {content.length.toLocaleString("ko-KR")} / 10,000자
        </p>
        <fieldset className="group-announcement-form__scope">
          <legend>공개 범위</legend>
          <Radio
            checked={scope === "MEMBERS"}
            data-ph-capture-attribute-action="group_announcement_scope_change"
            description="현재 모임원만 볼 수 있어요."
            label="모임원 공개"
            name="announcement-scope"
            onChange={() => setScope("MEMBERS")}
            value="MEMBERS"
          />
          <Radio
            checked={scope === "PUBLIC"}
            data-ph-capture-attribute-action="group_announcement_scope_change"
            description="로그인하지 않은 방문자도 볼 수 있어요."
            label="전체 공개"
            name="announcement-scope"
            onChange={() => setScope("PUBLIC")}
            value="PUBLIC"
          />
        </fieldset>
        {formError ? <p className="group-announcement-form__error" role="alert">{formError}</p> : null}
        <div className="group-announcement-form__actions">
          <Button
            data-ph-capture-attribute-action="group_announcement_create_cancel"
            disabled={create.isPending}
            onClick={closeForm}
            type="button"
            variant="secondary"
          >
            취소
          </Button>
          <Button
            data-ph-capture-attribute-action="group_announcement_create_submit"
            pending={create.isPending}
            type="submit"
          >
            공지 등록
          </Button>
        </div>
      </form>
    </Modal>
  );
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
  const list = useAnnouncementList(group.id, auth.member?.id, auth.sessionVersion);
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
      {list.isLoading ? (
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
      {canCreate ? (
        <AnnouncementCreateForm
          groupId={group.id}
          onOpenChange={setCreateOpen}
          open={createOpen}
        />
      ) : null}
    </section>
  );
}
