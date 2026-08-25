import {
  formatCompactLocalDateTime,
  recruitmentCountdownLabel
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
