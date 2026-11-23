import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button, Modal } from "../../shared/ui/index.js";
import { ClubhouseThemePicker } from "./ClubhouseThemePicker.jsx";

export function ClubhouseSetupDialog({ onComplete, onDismiss, onSave }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function saveSelection(template) {
    if (!template || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      if (await onSave(template)) onComplete();
    } catch {
      setError("아지트를 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      closeAction="group_space_setup_dismiss"
      description="나중에도 꾸미기에서 아지트를 바꿀 수 있어요."
      dismissible={!saving}
      onClose={() => { if (!inFlight.current) onDismiss(); }}
      open
      panelClassName="clubhouse-setup"
      title={<>
        <span className="clubhouse-setup__success" aria-hidden="true">
          <Check size={18} /> 모임을 만들었어요!
        </span>
        어떤 아지트에서 모일까요?
      </>}
    >
      <ClubhouseThemePicker disabled={saving} selected={selected} onSelect={(template) => {
        setSelected(template);
        setError("");
      }} />
      {error && <p className="clubhouse-setup__error" role="alert">{error}</p>}
      <div className="ui-dialog__actions clubhouse-setup__actions">
        <Button data-ph-capture-attribute-action="group_space_setup_skip" disabled={saving} onClick={() => saveSelection("lounge")} variant="secondary">
          기본 아지트로 시작하기
        </Button>
        <Button
          className="clubhouse-setup__confirm"
          data-ph-capture-attribute-action="group_space_setup_confirm"
          disabled={!selected}
          onClick={() => saveSelection(selected)}
          pending={saving}
          pendingLabel="저장 중"
        >
          이 아지트로 시작하기
        </Button>
      </div>
    </Modal>
  );
}
