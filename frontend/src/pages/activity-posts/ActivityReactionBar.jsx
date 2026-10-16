import { useState } from "react";

import { ACTIVITY_REACTION_EMOJIS } from "../../entities/activity-post/index.js";
import heartImage from "../../shared/assets/reactions/heart.webp";

const REACTION_IMAGES = Object.freeze({ HEART: heartImage });

/** 반응 종류의 이미지다. 장식용이라 의미는 버튼 이름이나 요약 문구가 전한다. */
export function ActivityReactionIcon({ className = "activity-reaction__icon", code }) {
  const src = REACTION_IMAGES[code];
  if (!src) return null;
  return <img alt="" className={className} draggable="false" height="96" src={src} width="96" />;
}

/**
 * 반응 종류마다 이미지와 개수를 보여 주는 토글 버튼이다. 지금은 하트 하나만 있다.
 * `onToggle(emoji, reacted)`의 `reacted`는 누르기 전 상태다.
 */
export function ActivityReactionBar({ label, onRequireLogin, onToggle, reactions, signedIn, size = "md" }) {
  const [pendingEmojis, setPendingEmojis] = useState(() => new Set());

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

  return (
    <div aria-label={label} className={`activity-reactions activity-reactions--${size}`} role="group">
      {ACTIVITY_REACTION_EMOJIS.map((emoji) => {
        const reaction = reactions.find((item) => item.emoji === emoji.code);
        const count = reaction?.count ?? 0;
        const reacted = Boolean(reaction?.reacted);
        return (
          <button
            aria-label={`${emoji.label} 반응 ${count}개${reacted ? ", 내가 남김" : ""}`}
            aria-pressed={reacted}
            className="activity-reaction"
            data-ph-capture-attribute-action="activity_reaction_toggle"
            disabled={pendingEmojis.has(emoji.code)}
            key={emoji.code}
            onClick={() => void toggle(emoji.code, reacted)}
            type="button"
          >
            <ActivityReactionIcon code={emoji.code} />
            {count > 0 ? <span className="activity-reaction__count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
