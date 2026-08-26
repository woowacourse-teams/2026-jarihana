import { useEffect, useId, useRef, useState } from "react";

import {
  DEFAULT_GROUP_IMAGE_URL,
  IMAGE_ALLOWED_CONTENT_TYPES,
  IMAGE_MAX_FILE_SIZE,
  isDefaultGroupImageUrl
} from "../../features/image-upload/index.js";
import imageIcon from "../../shared/assets/figma/edit-07.svg";
import { Button } from "../../shared/ui/index.js";

const ACCEPTED_IMAGE_TYPES = IMAGE_ALLOWED_CONTENT_TYPES.join(",");
const MAX_FILE_SIZE_LABEL = `${Math.round(IMAGE_MAX_FILE_SIZE / (1024 * 1024))}MB`;

function previewUrl(file) {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  return URL.createObjectURL(file);
}

export function RepresentativeImage({
  draft = false,
  imageKey,
  imageUrl = DEFAULT_GROUP_IMAGE_URL,
  onImageKeyChange,
  onUpload,
  uploadError,
  uploadPending = false
}) {
  const inputId = useId();
  const inputReference = useRef(null);
  const [preview, setPreview] = useState(null);
  const [localError, setLocalError] = useState("");
  const [cleared, setCleared] = useState(false);

  useEffect(
    () => () => {
      if (preview && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(preview);
      }
    },
    [preview]
  );

  const hasCustomImage =
    !cleared && Boolean(imageKey || preview || !isDefaultGroupImageUrl(imageUrl));
  const displayedImageUrl =
    cleared ? DEFAULT_GROUP_IMAGE_URL : preview || imageUrl || DEFAULT_GROUP_IMAGE_URL;
  const errorMessage = localError || uploadError?.userMessage;

  async function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !onUpload) return;

    setLocalError("");
    try {
      const result = await onUpload(file);
      const nextPreview = previewUrl(file);
      setPreview(nextPreview);
      setCleared(false);
      onImageKeyChange?.(result.imageKey);
    } catch (error) {
      setLocalError(error?.userMessage || "이미지를 업로드하지 못했어요.");
    }
  }

  function clearImage() {
    setPreview(null);
    setLocalError("");
    setCleared(true);
    onImageKeyChange?.(null);
  }

  return (
    <aside
      aria-label="대표 이미지"
      className={["group-editor__image-panel", draft && "group-editor__image-panel--draft"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="group-editor__image-art">
        <img
          className={[
            "group-editor__representative-image",
            draft && "group-editor__representative-image--draft"
          ]
            .filter(Boolean)
            .join(" ")}
          src={displayedImageUrl}
          alt="대표 이미지 미리보기"
        />
      </div>
      <div className="group-editor__image-footer">
        <div>
          <strong>{hasCustomImage ? "선택한 대표 이미지" : "서버 기본 대표 이미지"}</strong>
          <p>JPG, PNG, WEBP · 최대 {MAX_FILE_SIZE_LABEL}</p>
        </div>
        <div className="group-editor__image-actions">
          <Button
            className="group-editor__image-change"
            disabled={uploadPending}
            onClick={() => inputReference.current?.click()}
            pending={uploadPending}
            size="sm"
            type="button"
            variant="tertiary"
          >
            <img alt="" aria-hidden="true" src={imageIcon} />
            {hasCustomImage ? "대표 이미지 변경" : "대표 이미지 선택"}
          </Button>
          {hasCustomImage ? (
            <Button
              className="group-editor__image-clear"
              disabled={uploadPending}
              onClick={clearImage}
              size="sm"
              type="button"
              variant="tertiary"
            >
              기본 이미지 사용
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputReference}
        accept={ACCEPTED_IMAGE_TYPES}
        aria-label="대표 이미지 파일"
        className="group-editor__image-input"
        disabled={uploadPending}
        id={inputId}
        onChange={handleFileChange}
        type="file"
      />
      {errorMessage ? (
        <p className="group-editor__image-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </aside>
  );
}
