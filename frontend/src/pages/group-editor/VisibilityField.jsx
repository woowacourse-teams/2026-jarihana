import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { UnderlineSelect } from "./EditorFields.jsx";

export function VisibilityField({ canChooseCrew, descriptionId, savedVisibility, registration }) {
  const id = useId();
  const helpId = `${id}-help`;
  const helpReference = useRef(null);
  const [showsHelp, setShowsHelp] = useState(false);
  const canKeepCrew = savedVisibility === "CREW_ONLY";

  useEffect(() => {
    if (!showsHelp) return undefined;
    function dismiss(event) {
      if (event.key === "Escape" ||
          (event.type === "pointerdown" && !helpReference.current?.contains(event.target))) {
        setShowsHelp(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [showsHelp]);

  return (
    <div className="group-fact group-fact--visibility">
      <div>
        <UnderlineSelect
          aria-describedby={descriptionId}
          data-ph-capture-attribute-action="group_visibility_change"
          label="공개 범위"
          labelAction={
            <span
              className="group-editor__visibility-info"
              ref={helpReference}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") setShowsHelp(true);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== "touch" && !event.currentTarget.contains(document.activeElement)) {
                  setShowsHelp(false);
                }
              }}
            >
              <button
                aria-label="공개 범위 안내"
                aria-describedby={showsHelp ? helpId : undefined}
                data-ph-capture-attribute-action="group_visibility_help_open"
                onBlur={() => setShowsHelp(false)}
                onClick={() => setShowsHelp(true)}
                onFocus={() => setShowsHelp(true)}
                type="button"
              >
                <Info aria-hidden="true" size={16} />
              </button>
              {showsHelp && (
                <span className="group-editor__visibility-tooltip" id={helpId} role="tooltip">
                  <span><strong>공개</strong> 누구나 모임을 볼 수 있어요.</span>
                  <span><strong>비공개</strong> 현재 모임원만 볼 수 있고, 새 모임원은 초대로 합류해요.</span>
                  <span><strong>크루 공개</strong> 크루와 현재 모임원에게 보이며, 크루만 신청하거나 초대를 수락할 수 있어요.</span>
                </span>
              )}
            </span>
          }
          registration={registration}
        >
          <option value="PUBLIC">공개</option>
          <option value="PRIVATE">비공개</option>
          {(canChooseCrew || canKeepCrew) && <option value="CREW_ONLY">크루 공개</option>}
        </UnderlineSelect>
      </div>
    </div>
  );
}
