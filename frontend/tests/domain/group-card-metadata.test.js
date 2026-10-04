import {
  groupSeatsLabel,
  scheduleDuration
} from "../../src/pages/groups/home/groupCardMetadata.js";

describe("group card metadata", () => {
  it("returns the duration across an hour boundary", () => {
    expect(scheduleDuration({ startTime: "12:30", endTime: "14:00" })).toBe("90분");
  });

  it("returns null for recurring schedules with flexible times", () => {
    expect(scheduleDuration({ daysOfWeek: ["MONDAY"], startTime: null, endTime: null })).toBeNull();
  });

  it("counts complete elapsed minutes when times include seconds", () => {
    expect(scheduleDuration({ startTime: "09:05:50", endTime: "10:10:10" })).toBe("64분");
  });

  it("omits remaining seats when no recruitment data is available", () => {
    expect(groupSeatsLabel({ activeRecruitment: null })).toBeNull();
  });

  it("uses the current recruitment quota rather than total membership", () => {
    expect(
      groupSeatsLabel({ memberCount: 20, activeRecruitment: { capacity: 5, approvedCount: 2 } })
    ).toBe("3자리 남음");
  });
});
