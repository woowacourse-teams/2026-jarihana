import { CalendarDays, MapPin, Timer } from "lucide-react";
import { Link } from "react-router";

import { GroupImage } from "../../../shared/ui/index.js";
import { groupScheduleLabel, groupSeatsLabel, scheduleDuration } from "./groupCardMetadata.js";
import { typeLabel } from "../pageUtils.js";

export function DiscoveryGroupCard({ group, recruiting }) {
  const duration = group.type === "SESSION" ? scheduleDuration(group.sessionSchedule) : null;
  const seats = groupSeatsLabel(group);
  const location = group.location?.trim();

  return (
    <Link
      className={`discovery-group-card discovery-group-card--${group.type.toLowerCase()}`}
      data-ph-capture-attribute-action="group_view"
      to={`/groups/${group.id}`}
    >
      <span className="discovery-group-card__visual" aria-hidden="true">
        <GroupImage
          alt=""
          className="discovery-group-card__image"
          group={group}
          height="172"
          loading="lazy"
          width="320"
        />
      </span>
      <div className="discovery-group-card__body">
        <div className="discovery-group-card__top">
          <span
            className={`discovery-group-card__type discovery-group-card__type--${group.type.toLowerCase()}`}
          >
            {typeLabel(group.type)}
          </span>
          {recruiting ? <span className="discovery-group-card__recruiting">모집 중</span> : null}
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
    </Link>
  );
}
