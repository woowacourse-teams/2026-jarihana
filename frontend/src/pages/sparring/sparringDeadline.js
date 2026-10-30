export function remainingDeadline(closesAt, now) {
  if (!closesAt) return "마감일 없음";
  const milliseconds = new Date(closesAt).getTime() - now;
  if (!Number.isFinite(milliseconds)) return "마감일 없음";
  if (milliseconds <= 0) return "마감";

  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds >= 86400) return `D-${Math.ceil(seconds / 86400)}`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 ${remainingSeconds}초 남음`;
}
