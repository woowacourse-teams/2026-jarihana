import { useId, useLayoutEffect, useRef } from "react";
import { Button } from "../../shared/ui/index.js";

export function ClubhouseLandscapeDialog({ onReturn }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return <dialog ref={dialogRef} className="ui-dialog group-clubhouse__rotation-dialog"
    aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => event.preventDefault()}>
    <h2 className="ui-dialog__title" id={titleId}>휴대폰을 가로로 돌려 주세요</h2>
    <p className="ui-dialog__description" id={descriptionId}>
      아지트는 가로 화면에서 이용할 수 있어요. 기기의 화면 회전 잠금이 켜져 있다면 풀어 주세요.
    </p>
    <div className="ui-dialog__actions">
      <Button variant="secondary" data-ph-capture-attribute-action="group_space_collapse" onClick={onReturn}>
        모임 상세로 돌아가기
      </Button>
    </div>
  </dialog>;
}
