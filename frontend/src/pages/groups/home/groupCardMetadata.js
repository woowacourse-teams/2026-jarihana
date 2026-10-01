import { scheduleLines } from "../pageUtils.js";

function timeToSeconds(value) {
  if (!value) return null;
  const [hours, minutes, seconds = 0] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSessionDate(value) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}/${day}`;
}

export function scheduleDuration(schedule) {
  const start = timeToSeconds(schedule?.startTime);
  const end = timeToSeconds(schedule?.endTime);
  if (start === null || end === null) return null;

  const minutes = Math.floor((end - start) / 60);
  if (minutes <= 0) return null;
  return `${minutes}분`;
}

export function groupScheduleLabel(group) {
  if (group.sessionSchedule) {
    const schedule = group.sessionSchedule;
    const startTime = schedule.startTime.slice(0, 5);
    const endTime = schedule.endTime.slice(0, 5);
    return `${formatSessionDate(schedule.sessionDate)} · ${startTime} – ${endTime}`;
  }
  return scheduleLines(group).join(" · ");
}

export function groupSeatsLabel(group) {
  const recruitment = group.activeRecruitment;
  if (!recruitment) return null;

  const remaining = Math.max(recruitment.capacity - recruitment.approvedCount, 0);
  return remaining === 0 ? "자리 마감" : `${remaining}자리 남음`;
}
