import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router";

import { GroupImage } from "../../../shared/ui/index.js";
import { scheduleDuration } from "./groupCardMetadata.js";

function remainingSeats(group) {
  const recruitment = group.activeRecruitment;
  if (!recruitment) return null;
  return Math.max(recruitment.capacity - recruitment.approvedCount, 0);
}

function timeRange(group) {
  const schedule = group.sessionSchedule;
  if (!schedule) return "시간 협의";
  return `${schedule.startTime.slice(0, 5)} - ${schedule.endTime.slice(0, 5)}`;
}

function participationLabel(group) {
  const seats = remainingSeats(group);
  if (seats === null) return "모집 마감";
  if (seats <= 0) return "자리 마감";
  return `${seats}자리 남음`;
}

export function TodaySessionTicket({ active = false, group, tabIndex }) {
  const seats = remainingSeats(group);
  const duration = scheduleDuration(group.sessionSchedule);
  const location = group.location?.trim();

  return (
    <Link
      aria-current={active ? "true" : undefined}
      className="today-session-ticket"
      data-ph-capture-attribute-action="today_session_open"
      tabIndex={tabIndex}
      to={`/groups/${group.id}`}
    >
      <span className="today-session-ticket__image-frame">
        <GroupImage
          alt=""
          className="today-session-ticket__image"
          group={group}
          height="280"
          loading={active ? "eager" : "lazy"}
          width="420"
        />
      </span>
      <span className="today-session-ticket__body">
        <span className="today-session-ticket__time">
          <Clock3 aria-hidden="true" size={16} />
          {timeRange(group)}
        </span>
        <span className="today-session-ticket__title">{group.name}</span>
        <span className="today-session-ticket__intro">{group.introduction}</span>
        {(location || duration) && (
          <span className="today-session-ticket__details">
            {location && (
              <span className="today-session-ticket__location">
                <MapPin aria-hidden="true" size={16} />
                <span>{location}</span>
              </span>
            )}
            {location && duration && <span aria-hidden="true">·</span>}
            {duration && <span className="today-session-ticket__duration">{duration}</span>}
          </span>
        )}
      </span>
      <span className="today-session-ticket__stub">
        <span className="today-session-ticket__remaining">
          {seats === null ? (
            <strong>마감</strong>
          ) : (
            <strong>
              {seats}
              <small>자리</small>
            </strong>
          )}
        </span>
        <span className="today-session-ticket__cta">
          자세히 <ArrowRight aria-hidden="true" size={16} />
        </span>
      </span>
    </Link>
  );
}

export { participationLabel, remainingSeats, timeRange };
