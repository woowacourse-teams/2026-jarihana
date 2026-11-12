import { useEffect, useId, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Avatar, Button } from "../../shared/ui";

function SpectatorList({ spectators }) {
  const [openMode, setOpenMode] = useState(null);
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  const open = openMode !== null;

  useEffect(() => {
    if (!open) return undefined;
    function dismiss(event) {
      if (event.type === "keydown") {
        if (event.key !== "Escape") return;
        event.preventDefault();
        if (root.current?.contains(document.activeElement)) trigger.current?.focus();
      } else if (root.current?.contains(event.target)) return;
      setOpenMode(null);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  return (
    <div
      className="gomoku-spectators__anchor"
      ref={root}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpenMode((mode) => mode ?? "hover");
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || event.currentTarget.contains(document.activeElement))
          return;
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setOpenMode((mode) => (mode === "hover" ? null : mode));
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenMode(null);
      }}
    >
      <Button
        ref={trigger}
        variant="tertiary"
        size="sm"
        className="gomoku-spectators__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        data-ph-capture-attribute-action="gomoku_spectators_toggle"
        onFocus={() => setOpenMode((mode) => mode ?? "focus")}
        onClick={() => setOpenMode((mode) => (mode === "click" ? null : "click"))}
      >
        <Eye size={16} aria-hidden="true" />
        <span className="gomoku-spectators__label">관전자 {spectators.length}명</span>
      </Button>
      {open && (
        <div className="gomoku-spectators__dropdown">
          {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Keyboard users need focus on this scrollable roster. */}
          <section
            id={panelId}
            aria-label="관전자 목록"
            className="gomoku-spectators__panel"
            tabIndex={spectators.length ? 0 : undefined}
          >
            <h2>관전 중인 사람</h2>
            {spectators.length ? (
              <ul>
                {spectators.map((person) => (
                  <li key={person.memberId}>
                    <Avatar
                      src={person.avatarUrl}
                      alt={`${person.name} 프로필`}
                      fallback={person.name.slice(0, 1)}
                      size="sm"
                    />
                    <span>{person.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>아직 관전 중인 사람이 없어요.</p>
            )}
          </section>
          {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
        </div>
      )}
    </div>
  );
}

export function GomokuSpectators({ signal, connected }) {
  return (
    <div className="gomoku-spectators" data-ph-private>
      {connected && signal ? (
        <SpectatorList spectators={signal.spectators} />
      ) : (
        <span className="gomoku-spectators__loading">
          <Eye size={16} aria-hidden="true" /> 관전자 확인 중
        </span>
      )}
    </div>
  );
}
