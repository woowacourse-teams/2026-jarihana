import { useRef, useState } from "react";
import { Check } from "lucide-react";
import band from "../../shared/assets/clubhouse/band.webp";
import boardgame from "../../shared/assets/clubhouse/boardgame.webp";
import climbing from "../../shared/assets/clubhouse/climbing.webp";
import dining from "../../shared/assets/clubhouse/dining.webp";
import lounge from "../../shared/assets/clubhouse/lounge.webp";
import photo from "../../shared/assets/clubhouse/photo.webp";
import study from "../../shared/assets/clubhouse/study.webp";
import { Button, Modal } from "../../shared/ui/index.js";
import { ROOM_TEMPLATES } from "./roomState.js";
import "./clubhouse-setup.css";

const previews = { band, boardgame, climbing, dining, lounge, photo, study };

export function ClubhouseSetupDialog({ onComplete, onDismiss, onSave, notice }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  function skip() {
    if (!inFlight.current) onComplete();
  }

  async function saveSelection() {
    if (!selected || !onSave || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(selected);
    } catch {
      setError("아지트를 저장하지 못했어요. 다시 시도하거나 기본 아지트로 시작해 주세요.");
      return;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
    onComplete();
  }

  return (
    <Modal
      closeAction="group_space_setup_dismiss"
      description={onSave ? "나중에도 꾸미기에서 아지트를 바꿀 수 있어요." : notice}
      dismissible={!saving}
      onClose={() => { if (!inFlight.current) onDismiss(); }}
      open
      panelClassName="clubhouse-setup"
      title={<>
        {onSave && <span className="clubhouse-setup__success" aria-hidden="true">
          <Check size={18} /> 모임을 만들었어요!
        </span>}
        {onSave ? "어떤 아지트에서 모일까요?" : "모임을 만들었어요!"}
      </>}
    >
      {onSave && (
        <div aria-label="아지트 테마" className="clubhouse-setup__cards" role="group">
          {ROOM_TEMPLATES.map(({ id, name }) => (
            <button
              aria-pressed={selected === id}
              className="clubhouse-setup__card"
              data-ph-capture-attribute-action="space_template_select"
              disabled={saving}
              key={id}
              onClick={() => { setSelected(id); setError(""); }}
              type="button"
            >
              <img alt="" src={previews[id]} width={384} height={351} />
              <span>{name}</span>
              {selected === id && <Check aria-hidden="true" className="clubhouse-setup__check" size={22} />}
            </button>
          ))}
        </div>
      )}
      {error && <p className="clubhouse-setup__error" role="alert">{error}</p>}
      <div className="ui-dialog__actions clubhouse-setup__actions">
        <Button data-ph-capture-attribute-action="group_space_setup_skip" disabled={saving} onClick={skip} variant="secondary">
          {onSave ? "기본 아지트로 시작하기" : "계속하기"}
        </Button>
        {onSave && <Button
          className="clubhouse-setup__confirm"
          data-ph-capture-attribute-action="group_space_setup_confirm"
          disabled={!selected}
          onClick={saveSelection}
          pending={saving}
          pendingLabel="저장 중"
        >
          이 아지트로 시작하기
        </Button>}
      </div>
    </Modal>
  );
}
