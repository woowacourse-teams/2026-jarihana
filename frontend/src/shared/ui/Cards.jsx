import { forwardRef, useState } from "react";

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

export function Avatar({ alt = "", className, fallback = "?", size = "md", src }) {
  const [failedSource, setFailedSource] = useState(null);
  const classNames = classes(`ui-avatar ui-avatar--${size}`, className);

  if (src && failedSource !== src) {
    return (
      <img
        alt={alt}
        className={classNames}
        onError={() => setFailedSource(src)}
        src={src}
      />
    );
  }
  return (
    <span aria-label={alt || undefined} className={classNames}>
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

const DEFAULT_GROUP_IMAGE_PATH = /(^|\/)images\/default-group\.png$/;

/**
 * The default image is a frontend static asset, so it never goes through the API.
 * `new URL` rejects every relative input, leading slash or not, so the base is a
 * throwaway that only makes `images/...` and `/images/...` parseable. Absolute
 * CloudFront URLs discard it, and reading `pathname` drops any query string.
 */
function isDefaultGroupImage(imageUrl) {
  try {
    return DEFAULT_GROUP_IMAGE_PATH.test(new URL(imageUrl, "http://localhost").pathname);
  } catch {
    return DEFAULT_GROUP_IMAGE_PATH.test(String(imageUrl));
  }
}

export function groupImageUrl(group) {
  const imageUrl = group?.representativeImageUrl;
  if (!imageUrl) return DEFAULT_GROUP_IMAGE;
  if (isDefaultGroupImage(imageUrl)) return DEFAULT_GROUP_IMAGE;
  return imageUrl;
}

export function GroupImage({ alt = "", className, group, ...properties }) {
  return (
    <img
      {...properties}
      alt={alt}
      className={className}
      onError={(event) => {
        const image = event.currentTarget;
        const fallbackUrl = new URL(DEFAULT_GROUP_IMAGE, window.location.origin).href;

        if (image.src === fallbackUrl) {
          return;
        }
        image.src = fallbackUrl;
      }}
      src={groupImageUrl(group)}
    />
  );
}

function cardScheduleMeta(group) {
  const frequency = scheduleFrequencyText(group);
  const recruitment = group.activeRecruitment;
  if (!recruitment) {
    return frequency;
  }

  const remainingSeats = Math.max(recruitment.capacity - recruitment.approvedCount, 0);
  if (remainingSeats === 0) {
    return frequency;
  }
  return [frequency, `${remainingSeats}자리 남음`].filter(Boolean).join(" · ");
}

export function GroupCard({
  as: LinkComponent = "a",
  group,
  href = `/groups/${group.id}`,
  mobileAppearance,
  showScheduleMeta = false
}) {
  const destination = LinkComponent === "a" ? { href } : { to: href };
  const mobileActivityAppearance = mobileAppearance === "activity";
  const scheduleMeta = showScheduleMeta ? cardScheduleMeta(group) : null;
  return (
    <Card
      {...destination}
      as={LinkComponent}
      className={classes(
        "ui-group-card",
        mobileActivityAppearance && "ui-group-card--mobile-activity"
      )}
      interactive
    >
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
        <div className="ui-card__meta ui-group-card__top-meta">
          <span
            className={classes(
              "ui-group-card__type",
              `ui-group-card__type--${String(group.type).toLowerCase()}`
            )}
          >
            {readableType(group.type)}
          </span>
          {group.recruiting ? (
            <span className="ui-group-card__recruitment">
              <StatusBadge tone="brand">모집 중</StatusBadge>
            </span>
          ) : null}
        </div>
        <h3 className="ui-group-card__title">{group.name}</h3>
        <p className="ui-group-card__intro">{group.introduction}</p>
        {scheduleMeta ? (
          <span className="ui-card__meta ui-group-card__detail-meta">
            {scheduleMeta}
          </span>
        ) : showScheduleMeta || group.memberCount === undefined ? null : (
          <span className="ui-card__meta ui-group-card__detail-meta">
            함께하는 멤버 {group.memberCount}명
          </span>
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
