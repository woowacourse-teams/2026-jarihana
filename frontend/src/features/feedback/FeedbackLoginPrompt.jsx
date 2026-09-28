import { Button, Modal } from "../../shared/ui/index.js";

export function FeedbackLoginPrompt({ onClose, onLogin, open }) {
  return (
    <Modal
      description="피드백을 남기려면 로그인해 주세요."
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      open={open}
      title="로그인이 필요한 서비스예요"
    >
      <div className="ui-dialog__actions">
        <Button
          data-ph-capture-attribute-action="feedback_login_cancel"
          onClick={onClose}
          variant="secondary"
        >
          취소
        </Button>
        <Button
          data-ph-capture-attribute-action="feedback_login_start"
          onClick={onLogin}
          variant="primary"
        >
          로그인하러 가기
        </Button>
      </div>
    </Modal>
  );
}
