import {
  formatCompactLocalDateTime,
  recruitmentCountdownLabel,
  scheduleLines
} from "../../../src/pages/groups/pageUtils.js";

describe("formatCompactLocalDateTime", () => {
  it("keeps the year visible with the meeting time", () => {
    expect(formatCompactLocalDateTime("2026-08-01T09:00:00")).toBe(
      "2026년 8월 1일 09:00"
    );
  });

  it("keeps a different year visible and treats an open end as ongoing", () => {
    expect(formatCompactLocalDateTime("2027-01-03T18:30:00")).toBe(
      "2027년 1월 3일 18:30"
    );
    expect(formatCompactLocalDateTime(null)).toBe("상시");
  });
});

describe("recruitmentCountdownLabel", () => {
  it("shows how many days remain until an upcoming recruitment starts", () => {
    expect(
      recruitmentCountdownLabel(
        "2026-08-27T09:00:00",
        "2026-09-10T18:00:00",
        new Date("2026-08-25T12:00:00")
      )
    ).toBe("모집 시작까지 2일");
  });

  it("shows how many days remain until an active recruitment ends", () => {
    expect(
      recruitmentCountdownLabel(
        "2026-08-10T09:00:00",
        "2026-08-21T23:59:59",
        new Date("2026-08-20T12:00:00")
      )
    ).toBe("모집 마감까지 2일");
  });

  it("uses concise labels for today, ongoing, and closed periods", () => {
    const referenceDate = new Date("2026-08-25T12:00:00");

    expect(
      recruitmentCountdownLabel(
        "2026-08-25T18:00:00",
        "2026-09-01T18:00:00",
        referenceDate
      )
    ).toBe("오늘 모집 시작");
    expect(recruitmentCountdownLabel("2026-08-01T09:00:00", null, referenceDate)).toBe(
      "상시 모집"
    );
    expect(
      recruitmentCountdownLabel(
        "2026-08-01T09:00:00",
        "2026-08-24T18:00:00",
        referenceDate
      )
    ).toBe("모집이 마감됐어요");
  });
});

describe("scheduleLines", () => {
  it("요일과 시간이 모두 고정된 반복 일정은 두 줄로 읽힌다", () => {
    expect(
      scheduleLines({
        type: "STUDY",
        recurringSchedule: {
          daysOfWeek: ["MONDAY", "WEDNESDAY"],
          startTime: "19:00:00",
          endTime: "21:00:00"
        },
        sessionSchedule: null
      })
    ).toEqual(["매주 월·수", "19:00 – 21:00"]);
  });

  it("시간을 비운 반복 일정은 요일만 고정된 것으로 읽힌다", () => {
    expect(
      scheduleLines({
        type: "STUDY",
        recurringSchedule: { daysOfWeek: ["MONDAY"], startTime: null, endTime: null },
        sessionSchedule: null
      })
    ).toEqual(["매주 월", "시간 유동적"]);
  });
});
