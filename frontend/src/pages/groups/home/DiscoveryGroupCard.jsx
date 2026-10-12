import { CalendarDays, MapPin, Timer } from "lucide-react";

import { GroupDetailLink } from "../GroupTransition.jsx";
import { GroupImage, StatusBadge } from "../../../shared/ui/index.js";
import { groupScheduleLabel, groupSeatsLabel, scheduleDuration } from "./groupCardMetadata.js";
import { typeBadgeTone, typeLabel } from "../pageUtils.js";

export function DiscoveryGroupCard({ group, recruiting }) {
  const isEnded = group.status === "ENDED";
  const duration = group.type === "SESSION" ? scheduleDuration(group.sessionSchedule) : null;
  const seats = isEnded ? null : groupSeatsLabel(group);
  const location = group.location?.trim();

  return (
    <GroupDetailLink
      className={`discovery-group-card discovery-group-card--${group.type.toLowerCase()}${isEnded ? " discovery-group-card--ended" : ""}`}
      data-ph-capture-attribute-action="group_view"
      groupId={group.id}
      source="discovery"
    >
      <span className="discovery-group-card__visual">
        <span className="group-card-transition-image" data-group-transition-image>
          <GroupImage
            alt=""
            className="discovery-group-card__image"
            group={group}
            height="172"
            loading="lazy"
            width="320"
          />
          <span aria-hidden="true" className="group-transition-shade discovery-group-card__shade" />
        </span>
        {isEnded && <StatusBadge className="discovery-group-card__ended-badge" placement="overlay" tone="ended">종료</StatusBadge>}
        {recruiting && !isEnded && (
          <StatusBadge className="discovery-group-card__recruiting-badge" placement="overlay" tone="brand">모집 중</StatusBadge>
        )}
      </span>
      <div className="discovery-group-card__body">
        <div className="discovery-group-card__top">
          <StatusBadge
            className={`discovery-group-card__type discovery-group-card__type--${group.type.toLowerCase()}`}
            tone={typeBadgeTone(group.type)}
          >
            {typeLabel(group.type)}
          </StatusBadge>
        </div>
        <h3 className="discovery-group-card__title">{group.name}</h3>
        <p className="discovery-group-card__description">{group.introduction}</p>
        <span className="discovery-group-card__schedule">
          <CalendarDays aria-hidden="true" size={16} />
          {groupScheduleLabel(group)}
        </span>
        <div className="discovery-group-card__bottom">
          {(location || duration) && (
            <span className="discovery-group-card__details">
              {location && (
                <span className="discovery-group-card__location">
                  <MapPin aria-hidden="true" size={16} />
                  <span>{location}</span>
                </span>
              )}
              {duration && (
                <span className="discovery-group-card__duration">
                  <Timer aria-hidden="true" size={16} />
                  {duration}
                </span>
              )}
            </span>
          )}
          {seats ? <span className="discovery-group-card__seats">{seats}</span> : null}
        </div>
      </div>
    </GroupDetailLink>
  );
}
