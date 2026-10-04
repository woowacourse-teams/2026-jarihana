import { ApiError } from "../../shared/api/errors.js";
import { fetchGroups } from "./api.js";

export function getSeoulDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export async function fetchTodaySessions(date) {
  const groups = new Map();
  const cursors = new Set();
  let cursor;

  do {
    const page = await fetchGroups({
      type: "SESSION",
      status: "ACTIVE",
      sessionDate: date,
      size: 100,
      cursor
    });
    for (const group of page.items) groups.set(group.id, group);
    if (!page.hasNext) break;
    if (!page.nextCursor || cursors.has(page.nextCursor)) {
      throw new ApiError({ code: "INVALID_RESPONSE", status: 200 });
    }
    cursor = page.nextCursor;
    cursors.add(cursor);
  } while (cursor);

  return [...groups.values()].sort(
    (first, second) =>
      first.sessionSchedule.startTime.localeCompare(second.sessionSchedule.startTime) ||
      first.id - second.id
  );
}
