import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { toUserMessage } from "../../shared/api/index.js";
import { Button, Modal, Radio, Textarea, TextField, useToast } from "../../shared/ui/index.js";
import { AnnouncementCreationUnconfirmedError } from "./api.js";
import { useCreateAnnouncement, useModifyAnnouncement } from "./hooks.js";
import { clearPendingCreation, readPendingCreation, savePendingCreation } from "./pendingCreation.js";

export function AnnouncementFormDialog({ announcement, groupId, memberId, onOpenChange, open }) {
  const isEditing = Boolean(announcement);
  const create = useCreateAnnouncement(groupId);
  const modify = useModifyAnnouncement(groupId, announcement?.id);
  const mutation = isEditing ? modify : create;
  const toast = useToast();
  const storageKey = `announcement:create:${memberId}:${groupId}`;
  const [pendingCreation, setPendingCreation] = useState(() =>
    isEditing ? null : readPendingCreation(storageKey)
  );
  const [isRestored, setIsRestored] = useState(false);
  const showRecoveryChoice = Boolean(pendingCreation && !isRestored);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [scope, setScope] = useState(announcement?.scope ?? "MEMBERS");
  const [formError, setFormError] = useState("");
  const activeCreation = useRef(null);
  const recoveryNotice = useRef(null);
  const titleInput = useRef(null);
  const focusAfterTransition = useRef(false);
  const actionPrefix = isEditing ? "group_announcement_edit" : "group_announcement_create";
  const fieldActionPrefix = isEditing ? "group_announcement_edit" : "group_announcement";

  useEffect(() => () => activeCreation.current?.abort(), []);

  useLayoutEffect(() => {
    if (!focusAfterTransition.current) return;
    focusAfterTransition.current = false;
    (showRecoveryChoice ? recoveryNotice : titleInput).current?.focus();
  }, [showRecoveryChoice]);

  function restorePreviousRequest() {
    focusAfterTransition.current = true;
    setTitle(pendingCreation.title);
    setContent(pendingCreation.content);
    setScope(pendingCreation.scope);
    setIsRestored(true);
  }

  function startNewAnnouncement() {
    clearPendingCreation(storageKey, pendingCreation.requestId);
    focusAfterTransition.current = true;
    setPendingCreation(null);
    setTitle("");
    setContent("");
    setScope("MEMBERS");
  }

  async function submit(event) {
    event.preventDefault();
    if (mutation.isPending || activeCreation.current) return;
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
    let controller;
    let request;
    try {
      const payload = { title: cleanTitle, content: cleanContent, scope };
      if (isEditing) {
        await mutation.mutateAsync(payload);
      } else {
        request = pendingCreation ?? { ...payload, requestId: crypto.randomUUID() };
        savePendingCreation(storageKey, request);
        controller = new AbortController();
        activeCreation.current = controller;
        await mutation.mutateAsync({ values: request, signal: controller.signal });
        clearPendingCreation(storageKey, request.requestId);
      }
      if (controller?.signal.aborted) return;
      onOpenChange(false);
      toast.success({ title: isEditing ? "공지를 수정했어요" : "공지를 등록했어요" });
    } catch (error) {
      if (controller?.signal.aborted) return;
      if (error instanceof AnnouncementCreationUnconfirmedError) {
        focusAfterTransition.current = true;
        setPendingCreation(request);
        setIsRestored(false);
        return;
      }
      if (request && (!pendingCreation || error?.code === "ANNOUNCEMENT_REQUEST_CONFLICT")) {
        clearPendingCreation(storageKey, request.requestId);
        setPendingCreation(null);
        setIsRestored(false);
      }
      setFormError(toUserMessage(error?.code));
    } finally {
      activeCreation.current = null;
    }
  }

  return (
    <Modal
      closeAction={`${actionPrefix}_dismiss`}
      description={showRecoveryChoice
        ? undefined
        : isEditing
          ? "수정해도 모임원에게 알림을 다시 보내지 않습니다."
          : isRestored
            ? "이전에 보낸 내용을 불러왔어요. 아래 버튼을 누르면 같은 요청을 다시 보내요."
            : "모임원에게 알림함으로 전달되며, 푸시 알림을 켠 모임원에게 알림을 보냅니다."}
      dismissible={!mutation.isPending}
      onOpenChange={onOpenChange}
      open={open}
      panelClassName="ui-dialog--group-announcement-form"
      title={isEditing ? "공지 수정" : "공지 등록"}
    >
      {showRecoveryChoice ? (
        <div className="group-announcement-form">
          <div className="group-announcement-form__recovery-notice" ref={recoveryNotice} role="alert" tabIndex={-1}>
            <strong>이전 공지의 등록 결과를 확인하지 못했어요</strong>
            <p>이미 등록됐을 수 있어요. 새 공지를 쓰기 전에 목록에서 확인해 주세요.</p>
          </div>
          <div className="group-announcement-form__recovery-actions">
            <Button
              data-ph-capture-attribute-action="group_announcement_create_start_new"
              onClick={startNewAnnouncement}
              variant="secondary"
            >
              새 공지 쓰기
            </Button>
            <Button
              data-ph-capture-attribute-action="group_announcement_create_restore"
              onClick={restorePreviousRequest}
            >
              이전 요청 불러오기
            </Button>
          </div>
        </div>
      ) : (
        <form className="group-announcement-form" data-ph-private noValidate onSubmit={submit}>
          <TextField
            data-ph-capture-attribute-action={`${fieldActionPrefix}_title_change`}
            label="공지 제목"
            maxLength={100}
            onChange={(event) => setTitle(event.currentTarget.value)}
            readOnly={Boolean(pendingCreation) || mutation.isPending}
            ref={titleInput}
            required
            value={title}
          />
          <Textarea
            data-ph-capture-attribute-action={`${fieldActionPrefix}_content_change`}
            description="마크다운 없이 일반 텍스트로 입력해 주세요."
            label="공지 내용"
            maxLength={10000}
            onChange={(event) => setContent(event.currentTarget.value)}
            readOnly={Boolean(pendingCreation) || mutation.isPending}
            required
            rows={7}
            value={content}
          />
          <p className="group-announcement-form__count" aria-live="polite">
            {content.length.toLocaleString("ko-KR")} / 10,000자
          </p>
          <fieldset className="group-announcement-form__scope" disabled={Boolean(pendingCreation) || mutation.isPending}>
            <legend>공개 범위</legend>
            <Radio
              checked={scope === "MEMBERS"}
              data-ph-capture-attribute-action={`${fieldActionPrefix}_scope_change`}
              description="현재 모임원과 작성자가 볼 수 있어요."
              label="모임원 공개"
              name="announcement-scope"
              onChange={() => setScope("MEMBERS")}
              value="MEMBERS"
            />
            <Radio
              checked={scope === "PUBLIC"}
              data-ph-capture-attribute-action={`${fieldActionPrefix}_scope_change`}
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
              data-ph-capture-attribute-action={`${actionPrefix}_cancel`}
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="secondary"
            >
              취소
            </Button>
            <Button
              data-ph-capture-attribute-action={isRestored
                ? "group_announcement_create_resubmit"
                : `${actionPrefix}_submit`}
              pending={mutation.isPending}
              type="submit"
            >
              {isEditing ? "수정 완료" : isRestored ? "이전 요청 다시 보내기" : "공지 등록"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
