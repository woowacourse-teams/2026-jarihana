export const COURSE_LABELS = {
  ANDROID: "안드로이드",
  BACKEND: "백엔드",
  COACH: "코치",
  FRONTEND: "프론트엔드"
};

export const MEMBER_TYPE_LABELS = {
  COACH: "코치",
  CREW: "크루"
};

export const GROUP_TYPE_LABELS = {
  CLUB: "동아리",
  SESSION: "같이해요",
  STUDY: "스터디"
};

export const REGISTRATION_STATUS_LABELS = {
  APPROVED: "승인",
  PENDING: "검토 중",
  REJECTED: "거절"
};

const GROUP_DAY_LABELS = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일"
};

const koreanDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium"
});

export function flattenPages(data) {
  const seen = new Set();
  return (data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

export function formatKoreanDate(value) {
  if (!value) return "날짜 미정";
  return koreanDateFormatter.format(new Date(value));
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return "시간 유동적";
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

export function groupScheduleLabel(group) {
  if (group.sessionSchedule) {
    const { endTime, sessionDate, startTime } = group.sessionSchedule;
    return `${sessionDate.replaceAll("-", ".")} · ${formatTimeRange(startTime, endTime)}`;
  }

  if (group.recurringSchedule) {
    const { daysOfWeek, endTime, startTime } = group.recurringSchedule;
    const days = daysOfWeek.map((day) => GROUP_DAY_LABELS[day] ?? day).join("·");
    return `매주 ${days} · ${formatTimeRange(startTime, endTime)}`;
  }

  return group.type === "SESSION" ? "일정 협의" : "일정 유동적";
}

export function generationLabel(generation) {
  return Number.isInteger(generation) && generation > 0 ? `${generation}기` : "기수 미정";
}

export function memberMetaLabel(member) {
  if (member.memberType === "COACH") return MEMBER_TYPE_LABELS.COACH;
  return `${generationLabel(member.generation)} / ${COURSE_LABELS[member.course] ?? member.course}`;
}
