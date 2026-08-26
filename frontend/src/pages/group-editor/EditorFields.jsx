import { ImagePlus } from "lucide-react";
import { useId, useState } from "react";

import { Button, Modal } from "../../shared/ui/index.js";

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

/* 상세 페이지의 dt/dd와 같은 모양. 밑줄이 없으니 고칠 수 없는 값이라는 게 읽힌다. */
export function ReadOnlyFact({ label, value }) {
  return (
    <div className="group-fact group-fact--readonly">
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}

/* 일정은 모달에서 고친다. 히어로에는 상세 페이지와 같은 요약만 남는다. */
export function ScheduleFact({ actionLabel = "수정", lines, onEdit }) {
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
        </dd>
      </div>
    </div>
  );
}

/*
 * 대표 이미지 자리는 남겨 두되 아직 올릴 수 없다는 것을 분명히 한다.
 * 백엔드에 업로드 경로가 없다: ImageUpload 컨트롤러가 없고 생성/수정 요청에도
 * representativeImageKey 필드가 없다. 파일 선택창을 띄우면 저장되지 않는 것을
 * 저장한 것처럼 보이게 되므로, 누르면 준비 중임을 알리는 것까지만 한다.
 */
export function RepresentativeImageNotice() {
  const [noticeOpen, setNoticeOpen] = useState(false);

  return (
    <>
      <button
        className="group-editor__image-button"
        onClick={() => setNoticeOpen(true)}
        type="button"
      >
        <ImagePlus aria-hidden="true" size={18} strokeWidth={2.25} />
        <span>대표 이미지</span>
        <span className="group-editor__image-badge">준비 중</span>
      </button>
      <Modal
        description="대표 이미지 업로드는 아직 준비 중이에요. 기능이 열리기 전까지는 서버 기본 이미지가 적용돼요."
        onClose={() => setNoticeOpen(false)}
        open={noticeOpen}
        title="대표 이미지는 곧 바꿀 수 있어요"
      >
        <div className="ui-dialog__actions">
          <Button onClick={() => setNoticeOpen(false)}>확인</Button>
        </div>
      </Modal>
    </>
  );
}
