import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { visibilityOptionValue } from "../../entities/group/index.js";

import { UnderlineSelect } from "./EditorFields.jsx";

/**
 * @param affiliations 회원이 확인된 소속. 소속마다 "소속 공개" 선택지를 둔다.
 * @param savedAffiliation 저장된 소속 공개 모임의 소속. 위임받은 모임장이 그 소속이 아니어도 지금 값을 유지할 수 있게 둔다.
 */
export function VisibilityField({ affiliations = [], descriptionId, savedAffiliation, registration }) {
  const id = useId();
  const helpId = `${id}-help`;
  const helpReference = useRef(null);
  const [showsHelp, setShowsHelp] = useState(false);
  const affiliationOptions =
    savedAffiliation && !affiliations.some((affiliation) => affiliation.id === savedAffiliation.id)
      ? [...affiliations, savedAffiliation]
      : affiliations;

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
                  <span><strong>소속 공개</strong> 같은 소속 회원과 현재 모임원에게 보이며, 같은 소속만 신청하거나 초대를 수락할 수 있어요.</span>
                </span>
              )}
            </span>
          }
          registration={registration}
        >
          <option value="PUBLIC">공개</option>
          <option value="PRIVATE">비공개</option>
          {affiliationOptions.map((affiliation) => (
            <option key={affiliation.id} value={visibilityOptionValue("AFFILIATION_ONLY", affiliation.id)}>
              {affiliation.name} 공개
            </option>
          ))}
        </UnderlineSelect>
      </div>
    </div>
  );
}
