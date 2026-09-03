import { ImagePlus } from "lucide-react";
import { useId, useRef, useState } from "react";

/*
 * 상세 페이지(.group-profile) 위에 얹는 입력들.
 * #119의 언더라인 패턴을 따른다: 밑줄은 감싸는 래퍼가 갖고, 컨트롤은 래퍼 폭을 채운다.
 * 밑줄을 컨트롤에 직접 걸면 밑줄이 글자 폭에서 끊기고 화살표 영역이 죽는다.
 */

function fieldIds(id, generated) {
  const inputId = id || `editor-${generated}`;
  return { errorId: `${inputId}-error`, inputId };
}

export function UnderlineField({
  className = "",
  error,
  label,
  labelHidden = false,
  registration,
  ...properties
}) {
  const generated = useId();
  const { errorId, inputId } = fieldIds(properties.id, generated);

  return (
    <div className={`group-editor__field ${className}`.trim()}>
      <label
        className={
          labelHidden ? "group-editor__field-label is-hidden" : "group-editor__field-label"
        }
        htmlFor={inputId}
      >
        {label}
      </label>
      <span className="group-editor__ul">
        <input
          {...properties}
          {...registration}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          id={inputId}
        />
      </span>
      {error ? (
        <p className="group-editor__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function UnderlineSelect({
  children,
  className = "",
  error,
  label,
  labelHidden = false,
  registration,
  ...properties
}) {
  const generated = useId();
  const { errorId, inputId } = fieldIds(properties.id, generated);

  return (
    <div className={`group-editor__field ${className}`.trim()}>
      <label
        className={
          labelHidden ? "group-editor__field-label is-hidden" : "group-editor__field-label"
        }
        htmlFor={inputId}
      >
        {label}
      </label>
      <span className="group-editor__ul group-editor__ul--select">
        <select
          {...properties}
          {...registration}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          id={inputId}
        >
          {children}
        </select>
      </span>
      {error ? (
        <p className="group-editor__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* 일정은 모달에서 고친다. 히어로에는 상세 페이지와 같은 요약만 남는다. */
/*
 * 일정은 모달에서 고치므로, 일정 오류를 모달 안에서만 보여주면 모달을 닫는 순간
 * 사라진다. 제출이 막히는데 이유가 화면에 없으니 여기에도 함께 드러낸다.
 */
export function ScheduleFact({ actionLabel = "수정", error, lines, onEdit }) {
  return (
    <div className="group-fact group-fact--schedule">
      <div>
        <dt>모임 일정</dt>
        <dd>
          <button
            aria-label={`모임 일정 ${actionLabel}`}
            className="group-editor__schedule-row"
            onClick={onEdit}
            type="button"
          >
            <span className="group-editor__schedule-summary">
              {lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
            <span className="group-editor__schedule-edit">{actionLabel}</span>
          </button>
          {error ? (
            <p className="group-editor__error" role="alert">
              {error}
            </p>
          ) : null}
        </dd>
      </div>
    </div>
  );
}

/* 상세 페이지의 대표 이미지 버튼 디자인을 유지하면서 파일 업로드를 연결한다. */
export function RepresentativeImageNotice({
  hasCustomImage = false,
  onImageKeyChange,
  onPreviewChange,
  onUpload,
  uploadError,
  uploadPending = false
}) {
  const inputReference = useRef(null);
  const [localError, setLocalError] = useState("");

  async function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !onUpload) return;

    setLocalError("");
    try {
      const result = await onUpload(file);
      onImageKeyChange?.(result.imageKey);
      onPreviewChange?.(file);
    } catch (error) {
      setLocalError(error?.userMessage || "이미지를 업로드하지 못했어요.");
    }
  }

  const errorMessage = localError || uploadError?.userMessage;

  return (
    <>
      <button
        className="group-editor__image-button"
        disabled={uploadPending}
        onClick={() => inputReference.current?.click()}
        type="button"
      >
        <ImagePlus aria-hidden="true" size={18} strokeWidth={2.25} />
        <span>대표 이미지</span>
        <span className="group-editor__image-badge">
          {hasCustomImage ? "변경" : "추가"}
        </span>
      </button>
      <input
        ref={inputReference}
        accept="image/jpeg,image/png,image/webp"
        aria-label="대표 이미지 파일"
        disabled={uploadPending}
        onChange={handleFileChange}
        style={{ display: "none" }}
        type="file"
      />
      {errorMessage ? (
        <p className="group-editor__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
