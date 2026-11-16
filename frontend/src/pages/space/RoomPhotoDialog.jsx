import { useEffect, useState } from "react";
import { useCreateActivityPost } from "../../features/activity-post/hooks.js";
import { Button, Modal } from "../../shared/ui/index.js";
import { ActivityPostComposer } from "../activity-posts/ActivityPostComposer.jsx";
import "../activity-posts/activity-posts.css";

export function RoomPhotoDialog({ file, group, onClose }) {
  const [preview] = useState(() => URL.createObjectURL(file));
  const [composing, setComposing] = useState(false);
  const createPost = useCreateActivityPost();
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);
  if (composing) return <ActivityPostComposer open initialFile={file} fixedGroup={group} onClose={onClose}
    savePending={createPost.isPending} onSave={({ groupId, ...values }) => createPost.mutateAsync({ groupId, values })} />;
  return <Modal open title="아지트 사진" closeAction="space_camera_preview_close" onClose={onClose}>
    <img className="room-photo-preview" src={preview} alt="방금 촬영한 아지트" />
    <div className="room-photo-actions">
      {group && <Button data-ph-capture-attribute-action="space_camera_activity_attach" onClick={() => setComposing(true)}>활동 기록에 첨부</Button>}
      <a href={preview} download={file.name} data-ph-capture-attribute-action="space_camera_download">사진 저장</a>
      <Button variant="secondary" data-ph-capture-attribute-action="space_camera_retake" onClick={onClose}>다시 찍기</Button>
    </div>
  </Modal>;
}
