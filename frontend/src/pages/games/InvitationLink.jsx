import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { Button, IconButton } from "../../shared/ui";

export function InvitationLink({ url, locked, canCreate, onCreate }) {
  const [expanded, setExpanded] = useState(false);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState("");
  const panelId = useId();
  const root = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    function dismiss(event) {
      if (event.type === "keydown") {
        if (event.key !== "Escape") return;
        event.preventDefault();
        trigger.current?.focus();
      } else if (root.current?.contains(event.target)) return;
      setExpanded(false);
    }
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [expanded]);

  async function toggle() {
    setNotice("");
    if (url) setExpanded((value) => !value);
    else if (await onCreate()) setExpanded(true);
  }

  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("초대 링크를 복사했어요.");
      setExpanded(false);
      trigger.current?.focus();
    } catch {
      setNotice("클립보드에 접근할 수 없어요. 아래 링크를 직접 복사해 주세요.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div ref={root} className="gomoku-invitation">
      <Button
        ref={trigger}
        variant="secondary"
        disabled={!url && locked}
        aria-expanded={expanded}
        aria-controls={panelId}
        data-ph-capture-attribute-action="gomoku_invitation_toggle"
        onClick={() => void toggle()}
      >
        <ChevronDown className="gomoku-invitation-chevron" size={16} aria-hidden="true" />
        {" 초대링크"}
      </Button>
      <p role="status" className="ui-sr-only ph-no-capture ph-no-record">
        {notice}
      </p>
      {expanded && (
        <section
          id={panelId}
          aria-label="초대 링크"
          className="gomoku-invitation-panel ph-no-capture ph-no-record"
        >
          {notice && <p className="games-help">{notice}</p>}
          <div className="games-invite-link">
            <label className="ui-sr-only" htmlFor={`${panelId}-url`}>
              초대 링크
            </label>
            <div className="gomoku-invitation-field">
              <input
                id={`${panelId}-url`}
                readOnly
                value={url}
                data-ph-capture-attribute-action="gomoku_invitation_link_select"
                onFocus={(event) => event.target.select()}
              />
              <IconButton
                label={copying ? "복사 중" : "복사"}
                title="초대 링크 복사"
                variant="tertiary"
                className="gomoku-invitation-copy"
                disabled={!url || locked || copying}
                data-ph-capture-attribute-action="gomoku_invitation_copy"
                onClick={() => void copy()}
              >
                {copying ? <span className="ui-spinner" /> : <Copy size={18} />}
              </IconButton>
            </div>
          </div>
          <div className="gomoku-invitation-panel__actions">
            {canCreate && (
              <Button
                variant="secondary"
                disabled={locked || copying}
                data-ph-capture-attribute-action="gomoku_invitation_create"
                onClick={() => {
                  setNotice("");
                  void onCreate();
                }}
              >
                새 링크 만들기
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
