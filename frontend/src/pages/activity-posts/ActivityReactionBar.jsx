import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";

import { ACTIVITY_REACTION_EMOJIS, findReactionEmoji } from "../../entities/activity-post/index.js";

/**
 * 이모지별 개수 배지(GitHub 코멘트 반응 형태)와 이모지 고르기 창이다.
 * `onToggle(emoji, reacted)`의 `reacted`는 누르기 전 상태다.
 */
export function ActivityReactionBar({ label, onRequireLogin, onToggle, reactions, signedIn, size = "md" }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingEmojis, setPendingEmojis] = useState(() => new Set());
  const containerRef = useRef(null);
  const addButtonRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const container = containerRef.current;
    function closeWhenOutside(event) {
      if (!container?.contains(event.target)) setPickerOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      // 상세 다이얼로그까지 닫히지 않도록 고르기 창만 닫는다.
      event.stopPropagation();
      setPickerOpen(false);
      addButtonRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeWhenOutside);
    container?.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      container?.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  async function toggle(emoji, reacted) {
    if (!signedIn) {
      onRequireLogin();
      return;
    }
    if (pendingEmojis.has(emoji)) return;
    setPendingEmojis((current) => new Set(current).add(emoji));
    try {
      await onToggle(emoji, reacted);
    } catch {
      // 실패 안내와 되돌리기는 상위 mutation이 맡는다.
    } finally {
      setPendingEmojis((current) => {
        const next = new Set(current);
        next.delete(emoji);
        return next;
      });
    }
  }

  function openPicker() {
    if (!signedIn) {
      onRequireLogin();
      return;
    }
    setPickerOpen((open) => !open);
  }

  return (
    <div
      aria-label={label}
      className={`activity-reactions activity-reactions--${size}`}
      ref={containerRef}
      role="group"
    >
      <div className="activity-reactions__row">
        {reactions.map((reaction) => {
          const emoji = findReactionEmoji(reaction.emoji);
          if (!emoji) return null;
          return (
            <button
              aria-label={`${emoji.label} 반응 ${reaction.count}개${reaction.reacted ? ", 내가 남김" : ""}`}
              aria-pressed={reaction.reacted}
              className="activity-reaction"
              data-ph-capture-attribute-action="activity_reaction_toggle"
              disabled={pendingEmojis.has(reaction.emoji)}
              key={reaction.emoji}
              onClick={() => void toggle(reaction.emoji, reaction.reacted)}
              type="button"
            >
              <span aria-hidden="true">{emoji.symbol}</span>
              <span className="activity-reaction__count">{reaction.count}</span>
            </button>
          );
        })}
        <button
          aria-expanded={pickerOpen}
          aria-label={`${label} 추가`}
          className="activity-reaction-add"
          data-ph-capture-attribute-action="activity_reaction_picker_open"
          onClick={openPicker}
          ref={addButtonRef}
          type="button"
        >
          <SmilePlus aria-hidden="true" size={size === "sm" ? 14 : 16} />
        </button>
      </div>
      {pickerOpen ? (
        <div aria-label="이모지 고르기" className="activity-reaction-picker" role="group">
          {ACTIVITY_REACTION_EMOJIS.map((emoji) => {
            const reacted = reactions.some((reaction) => reaction.emoji === emoji.code && reaction.reacted);
            return (
              <button
                aria-label={emoji.label}
                aria-pressed={reacted}
                data-ph-capture-attribute-action="activity_reaction_pick"
                key={emoji.code}
                onClick={() => {
                  setPickerOpen(false);
                  addButtonRef.current?.focus();
                  void toggle(emoji.code, reacted);
                }}
                title={emoji.label}
                type="button"
              >
                <span aria-hidden="true">{emoji.symbol}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
