const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function flattenPages(data) {
  return data?.pages?.flatMap((page) => page.items) ?? [];
}

export function formatDate(value) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return "상시 모집";
  return dateTimeFormatter.format(new Date(value));
}

export function courseLabel(course) {
  return (
    {
      ANDROID: "안드로이드",
      BACKEND: "백엔드",
      FRONTEND: "프론트엔드"
    }[course] ?? course
  );
}

export function roleLabel(role) {
  return role === "LEADER" ? "모임장" : "멤버";
}

export function statusLabel(status) {
  return (
    {
      ALWAYS_OPEN: "상시 모집",
      APPROVED: "승인",
      CLOSED: "마감",
      OPEN: "모집 중",
      PENDING: "대기",
      REJECTED: "거절",
      SCHEDULED: "모집 예정",
      UPCOMING: "모집 예정"
    }[status] ?? status
  );
}

export function statusTone(status) {
  if (["ALWAYS_OPEN", "LEADER", "OPEN"].includes(status)) return "brand";
  if (status === "APPROVED") return "success";
  if (["PENDING", "SCHEDULED", "UPCOMING"].includes(status)) return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

export function errorView(error) {
  const status = error?.status;
  if (status === 403) {
    return { description: "모임장만 이 화면을 볼 수 있어요.", title: "접근 권한이 없어요" };
  }
  if (status === 404) {
    return {
      description: "주소를 확인하거나 이전 화면으로 돌아가 주세요.",
      title: "정보를 찾을 수 없어요"
    };
  }
  if (status === 409) {
    return {
      description: "화면을 새로고침한 뒤 다시 시도해 주세요.",
      title: "이미 처리된 요청이에요"
    };
  }
  if (status === 422) {
    return { description: "모임장 위임 조건을 확인해 주세요.", title: "지금은 처리할 수 없어요" };
  }
  return {
    description: "연결 상태를 확인하고 다시 시도해 주세요.",
    title: "정보를 불러오지 못했어요"
  };
}
