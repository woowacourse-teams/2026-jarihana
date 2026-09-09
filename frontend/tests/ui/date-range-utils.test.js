import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  addLocalDays,
  toLocalDateTimeValue
} from "../../src/shared/ui/dateRangeUtils.js";

function addLocalDaysInTimeZone(value, amount, timeZone) {
  const moduleUrl = pathToFileURL(
    resolve(process.cwd(), "src/shared/ui/dateRangeUtils.js")
  ).href;
  const script = `
    import { addLocalDays } from ${JSON.stringify(moduleUrl)};
    process.stdout.write(addLocalDays(${JSON.stringify(value)}, ${amount}));
  `;

  return execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, TZ: timeZone }
  });
}

describe("date range local value helpers", () => {
  it("keeps the browser local date and minute when formatting a Date", () => {
    expect(toLocalDateTimeValue(new Date(2026, 8, 2, 12, 34, 45))).toBe(
      "2026-09-02T12:34"
    );
  });

  it("crosses month and year boundaries without converting to UTC", () => {
    expect(addLocalDays("2026-12-30T23:15", 3)).toBe("2027-01-02T23:15");
  });

  it("preserves a nonexistent spring-forward wall-clock time when adding a day", () => {
    expect(addLocalDaysInTimeZone("2026-03-07T02:30", 1, "America/New_York")).toBe(
      "2026-03-08T02:30"
    );
  });

  it("preserves an ambiguous fall-back wall-clock time when adding a day", () => {
    expect(addLocalDaysInTimeZone("2026-10-31T01:30", 1, "America/New_York")).toBe(
      "2026-11-01T01:30"
    );
  });

  it("preserves the wall-clock time when subtracting across daylight-saving changes", () => {
    expect(addLocalDaysInTimeZone("2026-03-09T02:30", -1, "America/New_York")).toBe(
      "2026-03-08T02:30"
    );
  });

  it("rejects invalid local date-time values instead of normalizing them", () => {
    expect(addLocalDays("2026-02-30T10:00", 1)).toBe("");
    expect(addLocalDays("2026-09-02T24:00", 1)).toBe("");
    expect(addLocalDays("2026-09-02T12:60", 1)).toBe("");
  });
});
