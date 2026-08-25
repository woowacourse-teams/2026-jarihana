import { useState } from "react";

import imageIcon from "../../shared/assets/figma/edit-07.svg";
import { Button, Modal } from "../../shared/ui/index.js";

export function RepresentativeImage({ group }) {
  const imageUrl = group?.representativeImageUrl || "/images/default-group.png";
  const [noticeOpen, setNoticeOpen] = useState(false);

  return (
    <aside className="group-editor__image-panel" aria-label="대표 이미지">
      <div className="group-editor__image-art">
        <img
          className="group-editor__representative-image"
          src={imageUrl}
          alt={group?.name ? `${group.name} 대표` : "서버 기본 모임 대표"}
        />
      </div>
      <div className="group-editor__image-footer">
        <button
          className="group-editor__image-change"
          onClick={() => setNoticeOpen(true)}
          type="button"
        >
          <img alt="" aria-hidden="true" src={imageIcon} />
          대표 이미지 변경
        </button>
      </div>
      <Modal
        description="대표 이미지 업로드 기능이 준비되면 변경할 수 있어요. 지금은 서버 기본 이미지가 적용돼요."
        onClose={() => setNoticeOpen(false)}
        open={noticeOpen}
        title="대표 이미지를 변경할 수 없어요"
      >
        <div className="ui-dialog__actions">
          <Button onClick={() => setNoticeOpen(false)}>확인</Button>
        </div>
      </Modal>
    </aside>
  );
}
