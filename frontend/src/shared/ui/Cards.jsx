import { forwardRef } from "react";

export const DEFAULT_GROUP_IMAGE = "/images/default-group.png";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export const Card = forwardRef(function Card(
  { as: Element = "div", className, interactive = false, ...properties },
  reference
) {
  return (
    <Element
      {...properties}
      className={classes("ui-card", interactive && "ui-card--interactive", className)}
      ref={reference}
    />
  );
});

export function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

export function Avatar({ alt = "", fallback = "?", size = "md", src }) {
  if (src) {
    return <img alt={alt} className={`ui-avatar ui-avatar--${size}`} src={src} />;
  }
  return (
    <span aria-label={alt || undefined} className={`ui-avatar ui-avatar--${size}`}>
      {fallback}
    </span>
  );
}

function readableType(type) {
  return { CLUB: "동아리", SESSION: "세션", STUDY: "스터디" }[type] || type || "모임";
}

function scheduleFrequencyText(group) {
  const daysOfWeek = group.recurringSchedule?.daysOfWeek;
  if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
    return `주 ${daysOfWeek.length}회`;
  }
  return null;
}

export function groupImageUrl(group) {
  return group?.representativeImageUrl || DEFAULT_GROUP_IMAGE;
}

export function GroupImage({ alt = "", className, group, ...properties }) {
  return (
    <img
      {...properties}
      alt={alt}
      className={className}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = DEFAULT_GROUP_IMAGE;
      }}
      src={groupImageUrl(group)}
    />
  );
}

function cardScheduleMeta(group) {
  const frequency = scheduleFrequencyText(group);
  const recruitment = group.activeRecruitment;
  if (!recruitment) {
    return [frequency, "모집 마감"].filter(Boolean).join(" · ");
  }

  const remainingSeats = Math.max(recruitment.capacity - recruitment.approvedCount, 0);
  if (remainingSeats === 0) {
    return "모집 마감";
  }
  return [frequency, `${remainingSeats}자리 남음`].filter(Boolean).join(" · ");
}

export function GroupCard({
  as: LinkComponent = "a",
  group,
  href = `/groups/${group.id}`,
  showScheduleMeta = false
}) {
  const destination = LinkComponent === "a" ? { href } : { to: href };
  return (
    <Card {...destination} as={LinkComponent} className="ui-group-card" interactive>
      <div className="ui-group-card__visual">
        <GroupImage
          alt=""
          className="ui-group-card__image"
          group={group}
          height="288"
          loading="lazy"
          width="512"
        />
      </div>
      <div className="ui-group-card__body">
        <div className="ui-card__meta">
          <span>{readableType(group.type)}</span>
          <StatusBadge tone={group.recruiting ? "brand" : "neutral"}>
            {group.recruiting ? "모집 중" : "모집 마감"}
          </StatusBadge>
        </div>
        <h3 className="ui-group-card__title">{group.name}</h3>
        <p className="ui-group-card__intro">{group.introduction}</p>
        {showScheduleMeta ? (
          <span className="ui-card__meta">{cardScheduleMeta(group)}</span>
        ) : group.memberCount === undefined ? null : (
          <span className="ui-card__meta">함께하는 멤버 {group.memberCount}명</span>
        )}
      </div>
    </Card>
  );
}

function recruitmentTone(status) {
  if (status === "OPEN" || status === "ALWAYS_OPEN") return "brand";
  if (status === "SCHEDULED") return "warning";
  return "neutral";
}

function recruitmentLabel(status) {
  return (
    { ALWAYS_OPEN: "상시 모집", CLOSED: "마감", OPEN: "모집 중", SCHEDULED: "모집 예정" }[status] ||
    status
  );
}

export function RecruitmentCard({ as: LinkComponent = "a", href, recruitment }) {
  const Element = href ? LinkComponent : "article";
  const destination = href ? (LinkComponent === "a" ? { href } : { to: href }) : {};
  return (
    <Card {...destination} as={Element} className="ui-recruitment-card" interactive={Boolean(href)}>
      <StatusBadge tone={recruitmentTone(recruitment.status)}>
        {recruitmentLabel(recruitment.status)}
      </StatusBadge>
      <h3 className="ui-recruitment-card__title">{recruitment.title || "새 멤버 모집"}</h3>
      <div className="ui-card__meta">
        <span>{recruitment.joinMethod === "AUTO" ? "자동 승인" : "모임장 승인"}</span>
        <span>정원 {recruitment.capacity}명</span>
      </div>
    </Card>
  );
}
