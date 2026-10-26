function messageDate(at) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(at) ? at : `${at}+09:00`);
}

export function messageTime(at) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hour12: false
  }).format(messageDate(at));
}

export function messageDay(at) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(messageDate(at));
}
