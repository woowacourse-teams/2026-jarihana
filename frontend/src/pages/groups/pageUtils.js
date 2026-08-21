import { mergeCursorPages } from "../../entities/cursor/index.js";

const typeLabels = {
  CLUB: "동아리",
  STUDY: "스터디",
  SESSION: "세션"
};

const dayLabels = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일"
};

const statusLabels = {
  ALWAYS_OPEN: "상시 모집",
  CLOSED: "모집 마감",
  OPEN: "모집 중",
  SCHEDULED: "모집 예정"
};

export function flattenPages(data, getId) {
  const pages = data?.pages ?? (data?.items ? [data] : []);
  return mergeCursorPages(pages, getId).items;
}

export function getLastPage(data) {
  return data?.pages?.at(-1) ?? data ?? { hasNext: false, nextCursor: null };
}

export function typeLabel(type) {
  return typeLabels[type] ?? type;
}

export function recruitmentStatusLabel(status) {
  return statusLabels[status] ?? status;
}

export function statusTone(status) {
  if (status === "OPEN" || status === "ALWAYS_OPEN") return "brand";
  if (status === "SCHEDULED") return "warning";
  return "neutral";
}

export function formatLocalDateTime(value) {
  if (!value) return "상시";
  const [date, time = ""] = value.split("T");
  return `${date.replaceAll("-", ".")} ${time.slice(0, 5)}`.trim();
}

export function scheduleText(group) {
  if (group.recurringSchedule) {
    const days = group.recurringSchedule.daysOfWeek.map((day) => dayLabels[day] ?? day).join("·");
    return `매주 ${days} ${group.recurringSchedule.startTime.slice(0, 5)} – ${group.recurringSchedule.endTime.slice(0, 5)}`;
  }
  if (group.sessionSchedule) {
    return `${group.sessionSchedule.sessionDate.replaceAll("-", ".")} ${group.sessionSchedule.startTime.slice(0, 5)} – ${group.sessionSchedule.endTime.slice(0, 5)}`;
  }
  return "일정 협의";
}

export function courseLabel(course) {
  return { ANDROID: "안드로이드", BACKEND: "백엔드", FRONTEND: "프론트엔드" }[course];
}

export function publicErrorCopy(error, resource) {
  if (error?.status === 403) {
    return {
      title: `이 ${resource}을 볼 권한이 없어요`,
      description: "접근 권한이 있는 계정으로 다시 확인해주세요.",
      retryable: false
    };
  }
  if (error?.status === 404) {
    return {
      title: `${resource}을 찾을 수 없어요`,
      description: "삭제되었거나 주소가 잘못되었을 수 있어요.",
      retryable: false
    };
  }
  return {
    title: `${resource}을 불러오지 못했어요`,
    description: "연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.",
    retryable: true
  };
}
