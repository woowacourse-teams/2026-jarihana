import { Link } from "react-router";

import { GroupImage } from "../../../shared/ui/index.js";

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
  if (seats === null) return "모집 정보 확인";
  if (seats <= 0) return "자리 마감";
  return `${seats}자리 남음`;
}

function capacityLabel(group) {
  const recruitment = group.activeRecruitment;
  if (!recruitment) return "모집 정보 확인";
  return `정원 ${recruitment.capacity}명`;
}

export function TodaySessionTicket({ active = false, group, tabIndex }) {
  const seats = remainingSeats(group);

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
        <span className="today-session-ticket__time">{timeRange(group)}</span>
        <span className="today-session-ticket__title">{group.name}</span>
        <span className="today-session-ticket__intro">{group.introduction}</span>
      </span>
      <span className="today-session-ticket__stub">
        <span className="today-session-ticket__remaining">
          {seats === null ? (
            <strong>확인</strong>
          ) : (
            <strong>
              {seats}
              <small>자리</small>
            </strong>
          )}
          <span>{capacityLabel(group)}</span>
        </span>
        <span className="today-session-ticket__cta">
          자리 보기 <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}

export { participationLabel, remainingSeats, timeRange };
