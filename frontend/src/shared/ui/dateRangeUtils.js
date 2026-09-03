const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function pad(value) {
  return String(value).padStart(2, "0");
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function partsFromDate(date) {
  return {
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
}

export function toLocalDateTimeValue(date = new Date(Date.now())) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const { day, hour, minute, month, year } = partsFromDate(date);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function toDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const { day, month, year } = partsFromDate(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDateValue(value) {
  const match = DATE_PATTERN.exec(value || "");
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function splitLocalDateTime(value) {
  const match = DATE_TIME_PATTERN.exec(value || "");
  if (!match) return { date: "", time: "" };
  return { date: `${match[1]}-${match[2]}-${match[3]}`, time: `${match[4]}:${match[5]}` };
}

export function combineLocalDateTime(date, time) {
  return DATE_PATTERN.test(date || "") && /^\d{2}:\d{2}$/.test(time || "")
    ? `${date}T${time}`
    : "";
}

export function addLocalDays(value, amount) {
  const match = DATE_TIME_PATTERN.exec(value || "");
  if (!match || !Number.isInteger(amount)) return "";
  const [, year, month, day, hour, minute] = match.map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59
  ) {
    return "";
  }

  const shiftedDate = new Date(0);
  shiftedDate.setUTCHours(0, 0, 0, 0);
  shiftedDate.setUTCFullYear(year, month - 1, day + amount);

  return `${String(shiftedDate.getUTCFullYear()).padStart(4, "0")}-${pad(
    shiftedDate.getUTCMonth() + 1
  )}-${pad(shiftedDate.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
}

export function addDateDays(value, amount) {
  const date = parseDateValue(value);
  if (!date) return "";
  date.setDate(date.getDate() + amount);
  return toDateValue(date);
}

export function shiftDateMonth(value, amount) {
  const date = parseDateValue(value);
  if (!date) return "";
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return toDateValue(date);
}

export function monthStart(value) {
  const date = parseDateValue(value) || new Date(Date.now());
  return toDateValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function buildCalendarDays(monthValue) {
  const first = parseDateValue(monthStart(monthValue));
  if (!first) return [];
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
    return toDateValue(date);
  });
}

export function shiftVisibleMonth(monthValue, amount) {
  const date = parseDateValue(monthStart(monthValue));
  date.setMonth(date.getMonth() + amount);
  return monthStart(toDateValue(date));
}

export function minimumEndTime(startValue, endDate) {
  const start = splitLocalDateTime(startValue);
  if (!start.date || start.date !== endDate) return undefined;
  const [hour, minute] = start.time.split(":").map(Number);
  const nextMinute = hour * 60 + minute + 1;
  if (nextMinute >= 24 * 60) return null;
  return `${pad(Math.floor(nextMinute / 60))}:${pad(nextMinute % 60)}`;
}

export function formatDateLabel(value) {
  const date = parseDateValue(value);
  return date ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일` : "";
}

export function formatEndpointDate(value) {
  const date = parseDateValue(value);
  return date ? `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.` : "날짜 선택";
}

export function formatMonthLabel(value) {
  const date = parseDateValue(value);
  return date ? `${date.getFullYear()}년 ${date.getMonth() + 1}월` : "";
}
