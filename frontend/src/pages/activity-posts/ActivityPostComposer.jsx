import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";

import { useImageUpload, validateImageFile } from "../../features/image-upload/index.js";
import { ApiError } from "../../shared/api/index.js";
import { Button, Modal, Select, Textarea, TextField } from "../../shared/ui/index.js";

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function errorMessage(error) {
  return error?.userMessage || "입력한 내용을 다시 확인해 주세요.";
}

export function ActivityPostComposer({
  fixedGroup = null,
  groups = [],
  groupsError = false,
  groupsHasNext = false,
  groupsLoading = false,
  onClose,
  onLoadMoreGroups,
  onSave,
  open,
  post = null,
  savePending = false
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [activityDate, setActivityDate] = useState(post?.activityDate ?? todayLocalDate());
  const [previewUrl, setPreviewUrl] = useState(post?.imageUrl ?? null);
  const [submissionInProgress, setSubmissionInProgress] = useState(false);
  const previewUrlReference = useRef(post?.imageUrl ?? null);
  const submissionInProgressReference = useRef(false);
  const [formError, setFormError] = useState("");
  const imageUpload = useImageUpload();
  const today = todayLocalDate();
  const firstGroupId = groups[0]?.id;

  useEffect(() => {
    return () => {
      if (previewUrlReference.current?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrlReference.current);
      }
    };
  }, []);

  const activeGroupId =
    fixedGroup?.id ?? post?.group.id ?? (selectedGroupId === null ? firstGroupId : selectedGroupId);

  function selectPhoto(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setFormError("");
    if (!file) return;
    try {
      validateImageFile(file);
      if (previewUrlReference.current?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrlReference.current);
      }
      const nextUrl = URL.createObjectURL(file);
      previewUrlReference.current = nextUrl;
      setSelectedFile(file);
      setPreviewUrl(nextUrl);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  async function submitPost(event) {
    event.preventDefault();
    if (submissionInProgressReference.current) return;

    setFormError("");
    if (!fixedGroup && !post && !activeGroupId) {
      setFormError("기록을 남길 모임을 선택해 주세요.");
      return;
    }
    if (!post && !selectedFile) {
      setFormError("사진을 한 장 선택해 주세요.");
      return;
    }
    if (!activityDate || activityDate > today) {
      setFormError("활동 날짜는 오늘 또는 과거 날짜로 선택해 주세요.");
      return;
    }

    submissionInProgressReference.current = true;
    setSubmissionInProgress(true);
    try {
      const uploaded = selectedFile ? await imageUpload.mutateAsync(selectedFile) : null;
      await onSave({
        activityDate,
        caption: caption.trim() || null,
        groupId: Number(activeGroupId),
        imageKey: uploaded?.imageKey,
        postId: post?.id
      });
      onClose();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      submissionInProgressReference.current = false;
      setSubmissionInProgress(false);
    }
  }

  const imageSource = previewUrl ?? post?.imageUrl;
  const saving = submissionInProgress || imageUpload.isPending || savePending;

  return (
    <>
      <Modal
        closeLabel={saving ? "저장 중에는 닫을 수 없어요" : "닫기"}
        dismissible={!saving}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !submissionInProgressReference.current) onClose();
        }}
        open={open}
        title={post ? "활동 기록 수정" : "활동 기록 남기기"}
      >
        <form aria-busy={saving || undefined} className="activity-post-composer" onSubmit={submitPost}>
          {!fixedGroup && !post ? (
            <div className="activity-post-composer__group-field">
              <Select
                label="기록을 남길 모임"
                onChange={(event) => setSelectedGroupId(event.target.value)}
                required
                value={String(activeGroupId ?? "")}
              >
                <option value="">모임 선택</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
              {groupsLoading ? <span role="status">모임 목록을 불러오는 중이에요.</span> : null}
              {groupsError ? <span role="alert">모임 목록을 불러오지 못했어요.</span> : null}
              {groupsHasNext ? (
                <Button
                  data-ph-capture-attribute-action="activity_post_groups_load_more"
                  onClick={onLoadMoreGroups}
                  pending={groupsLoading}
                  size="sm"
                  variant="tertiary"
                >
                  모임 더 불러오기
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="activity-post-composer__group-name">
              {(fixedGroup ?? post?.group)?.name}
            </p>
          )}

          <div className="activity-post-composer__photo-field">
            <span className="activity-post-composer__label" id="activity-photo-label">
              활동 사진 <span aria-hidden="true">(필수)</span>
            </span>
            <label className="activity-photo-picker" htmlFor="activity-photo-file">
              {imageSource ? (
                <img alt="선택한 활동 사진 미리보기" src={imageSource} />
              ) : (
                <span className="activity-photo-picker__empty">
                  <ImagePlus aria-hidden="true" size={28} />
                  사진을 선택해 주세요
                </span>
              )}
              <span className="activity-photo-picker__action">
                <Camera aria-hidden="true" size={16} /> 사진 {post ? "바꾸기" : "선택"}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-labelledby="activity-photo-label"
                className="activity-photo-picker__input"
                data-ph-capture-attribute-action="activity_post_photo_select"
                id="activity-photo-file"
                onChange={selectPhoto}
                type="file"
              />
            </label>
            <p className="activity-post-composer__help">JPG, PNG, WEBP · 5MB 이하 · 사진 1장</p>
          </div>

          <TextField
            label="활동 날짜"
            max={today}
            onChange={(event) => setActivityDate(event.target.value)}
            required
            type="date"
            value={activityDate}
          />
          <div className="activity-post-composer__caption-field">
            <Textarea
              label="한 줄 소개"
              maxLength={50}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="사진에 담긴 순간을 짧게 소개해 주세요."
              rows={2}
              value={caption}
            />
            <span aria-live="polite" className="activity-post-composer__counter">
              {caption.length}/50
            </span>
          </div>

          <p className="activity-post-composer__public-note">
            이 기록은 비로그인 방문자를 포함한 모든 사용자에게 공개돼요.
          </p>
          {formError ? (
            <p className="ui-field__error" role="alert">
              {formError}
            </p>
          ) : null}
          {saving ? (
            <p className="activity-post-composer__saving" role="status">
              {post ? "수정 내용을 저장하고 있어요." : "사진을 올리고 있어요."} 완료될 때까지 창을 닫을 수 없어요.
            </p>
          ) : null}
          <div className="ui-dialog__actions">
            <Button
              data-ph-capture-attribute-action="activity_post_compose_cancel"
              disabled={saving}
              onClick={onClose}
              variant="secondary"
            >
              취소
            </Button>
            <Button
              data-ph-capture-attribute-action={
                post ? "activity_post_edit_submit" : "activity_post_publish_submit"
              }
              pending={saving}
              type="submit"
            >
              {post ? "수정 저장" : "공개하기"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function activityPostErrorMessage(error) {
  return error instanceof ApiError ? error.userMessage : errorMessage(error);
}
