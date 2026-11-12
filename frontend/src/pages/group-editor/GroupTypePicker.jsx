import { ChevronDown, Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const TYPES = [
  { value: "CLUB", label: "동아리", description: "동아리는 비학술적 모임으로 추천해요." },
  { value: "STUDY", label: "스터디", description: "스터디는 학술적 모임으로 추천해요." },
  { value: "SESSION", label: "같이해요", description: "같이해요는 일회성 모임으로 추천해요." }
];

export function GroupTypePicker({ value, onChange, registration, error }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const root = useRef(null);
  const toggle = useRef(null);
  const id = useId();
  const selected = TYPES.find((type) => type.value === value) ?? TYPES[1];

  useEffect(() => {
    if (!open) return undefined;
    function outside(event) {
      if (!root.current?.contains(event.target)) {
        setOpen(false);
        setInfo(null);
      }
    }
    function keydown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (info) setInfo(null);
      else {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", keydown);
    };
  }, [open, info]);

  return (
    <div className="group-editor__field group-editor__type-field" ref={root}>
      <input type="hidden" {...registration} />
      <button
        ref={toggle}
        aria-controls={`${id}-options`}
        aria-expanded={open}
        aria-label={`모임 종류: ${selected.label}`}
        className="group-type-picker__toggle"
        data-ph-capture-attribute-action="group_type_menu_toggle"
        onClick={() => { setOpen(!open); setInfo(null); }}
        type="button"
      >
        {selected.label}<ChevronDown aria-hidden="true" size={18} />
      </button>
      {open && (
        <div aria-label="모임 종류 선택" className="group-type-picker__menu" id={`${id}-options`} role="group">
          {TYPES.map((type) => (
            <div className="group-type-picker__row" key={type.value}>
              <button
                aria-pressed={value === type.value}
                className="group-type-picker__option"
                data-ph-capture-attribute-action="group_type_change"
                onClick={() => { onChange(type.value); setOpen(false); setInfo(null); toggle.current?.focus(); }}
                type="button"
              >
                {type.label}
              </button>
              <span className="group-type-picker__info-wrap"
                onPointerEnter={(event) => { if (event.pointerType !== "touch") setInfo(type.value); }}
                onPointerLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement) || !document.activeElement.matches(":focus-visible")) {
                    setInfo((current) => current === type.value ? null : current);
                  }
                }}
              >
                <button
                  aria-describedby={info === type.value ? `${id}-${type.value}` : undefined}
                  aria-label={`${type.label} 안내`}
                  className="group-type-picker__info"
                  data-ph-capture-attribute-action="group_type_info_open"
                  onClick={() => setInfo(type.value)}
                  onFocus={() => setInfo(type.value)}
                  onBlur={() => setInfo((current) => current === type.value ? null : current)}
                  type="button"
                ><Info aria-hidden="true" size={18} /></button>
                {info === type.value && <span className="group-type-picker__tooltip" id={`${id}-${type.value}`} role="tooltip">{type.description}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="group-editor__error" role="alert">{error}</p>}
    </div>
  );
}
