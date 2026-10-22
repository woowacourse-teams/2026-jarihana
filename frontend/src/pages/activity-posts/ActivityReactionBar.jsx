import { useId, useState } from "react";

import { ACTIVITY_REACTION_EMOJIS, describeActivityReactors } from "../../entities/activity-post/index.js";
import { useInfiniteActivityReactors } from "../../features/activity-post/hooks.js";
import heartImage from "../../shared/assets/reactions/heart.webp";

const REACTION_IMAGES = Object.freeze({ HEART: heartImage });

/** 반응 종류의 이미지다. 장식용이라 의미는 버튼 이름이나 요약 문구가 전한다. */
export function ActivityReactionIcon({ className = "activity-reaction__icon", code }) {
  const src = REACTION_IMAGES[code];
  if (!src) return null;
  return <img alt="" className={className} draggable="false" height="96" src={src} width="96" />;
}

/**
 * 반응 버튼 하나다. Slack처럼 마우스를 올리거나 키보드로 초점을 옮기면 누가 반응했는지 말풍선으로 보여 준다.
 * 터치로 누를 때는 말풍선을 띄우지 않고 반응만 바꾼다.
 */
function ReactionButton({ count, disabled, emoji, onToggle, reacted, target, viewerKey }) {
  const [peeking, setPeeking] = useState(false);
  const tooltipId = useId();
  const reactorsQuery = useInfiniteActivityReactors({
    target,
    emoji: emoji.code,
    viewerKey,
    enabled: peeking && count > 0
  });
  const firstPage = reactorsQuery.data?.pages[0];
  const summary = firstPage ? describeActivityReactors(firstPage, emoji.label) : null;
  const showTooltip = peeking && count > 0;

  return (
    <span className="activity-reaction-anchor" onPointerLeave={() => setPeeking(false)}>
      <button
        aria-describedby={showTooltip && summary ? tooltipId : undefined}
        aria-label={`${emoji.label} 반응 ${count}개${reacted ? ", 내가 남김" : ""}`}
        aria-pressed={reacted}
        className="activity-reaction"
        data-ph-capture-attribute-action="activity_reaction_toggle"
        disabled={disabled}
        onBlur={() => setPeeking(false)}
        onClick={onToggle}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setPeeking(true);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setPeeking(true);
        }}
        type="button"
      >
        <ActivityReactionIcon code={emoji.code} />
        {count > 0 ? <span className="activity-reaction__count">{count}</span> : null}
      </button>
      {showTooltip ? (
        <span className="activity-reaction-tooltip" id={tooltipId} role="tooltip">
          {summary ?? (reactorsQuery.isError ? "반응한 사람을 불러오지 못했어요" : "불러오는 중…")}
        </span>
      ) : null}
    </span>
  );
}

/**
 * 반응 종류마다 이미지와 개수를 보여 주는 토글 버튼이다. 지금은 하트 하나만 있다.
 * `onToggle(emoji, reacted)`의 `reacted`는 누르기 전 상태다.
 */
export function ActivityReactionBar({
  label,
  onRequireLogin,
  onToggle,
  reactions,
  signedIn,
  size = "md",
  target,
  viewerKey
}) {
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
        const reacted = Boolean(reaction?.reacted);
        return (
          <ReactionButton
            count={reaction?.count ?? 0}
            disabled={pendingEmojis.has(emoji.code)}
            emoji={emoji}
            key={emoji.code}
            onToggle={() => void toggle(emoji.code, reacted)}
            reacted={reacted}
            target={target}
            viewerKey={viewerKey}
          />
        );
      })}
    </div>
  );
}
