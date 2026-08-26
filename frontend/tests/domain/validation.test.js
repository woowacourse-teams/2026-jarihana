import { groupCreateFormSchema, groupModifyFormSchema } from "../../src/features/group/index.js";
import { memberSignupFormSchema } from "../../src/features/member/index.js";
import { recruitmentCreateFormSchema } from "../../src/features/recruitment/index.js";
import {
  registrationDecisionFormSchema,
  registrationFormSchema
} from "../../src/features/registration/index.js";

describe("member form validation", () => {
  it.each(["자리", "자리하나", "김자리"])("accepts a 2-4 Hangul crew name: %s", (crewName) => {
    // Given
    const values = { crewName, generation: 1, course: "FRONTEND" };

    // When
    const result = memberSignupFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(true);
  });

  it.each(["a자리", "자", "자리하나요"])("rejects an invalid crew name: %s", (crewName) => {
    // Given
    const values = { crewName, generation: 1, course: "FRONTEND" };

    // When
    const result = memberSignupFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("group form validation", () => {
  it("accepts a CLUB or STUDY without a recurring schedule as a flexible group", () => {
    // Given
    const values = {
      type: "STUDY",
      meetingType: "FLEXIBLE",
      location: null,
      name: "프론트엔드 스터디",
      introduction: "매주 함께 공부해요",
      description: "",
      recurringSchedule: null,
      sessionSchedule: null
    };

    // When
    const result = groupCreateFormSchema.safeParse(values);

    // Then 일정이 없으면 유동적 일정이다.
    expect(result.success).toBe(true);
  });

  it("requires a session schedule only for SESSION", () => {
    // Given
    const values = {
      type: "SESSION",
      meetingType: "FLEXIBLE",
      location: null,
      name: "일일 세션",
      introduction: "한 번 만나 깊게 이야기해요",
      description: "",
      recurringSchedule: null,
      sessionSchedule: null
    };

    // When
    const result = groupCreateFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects a recurring schedule whose end is not after its start", () => {
    // Given
    const values = {
      type: "CLUB",
      meetingType: "FLEXIBLE",
      location: null,
      name: "리액트 모임",
      introduction: "매주 함께 만나요",
      description: "",
      recurringSchedule: {
        daysOfWeek: ["MONDAY"],
        startTime: "20:00",
        endTime: "19:00"
      },
      sessionSchedule: null
    };

    // When
    const result = groupCreateFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });

  it("enforces backend group text limits", () => {
    // Given
    const values = {
      name: "가".repeat(51),
      introduction: "소개",
      description: "",
      meetingType: "FLEXIBLE",
      location: null
    };

    // When
    const result = groupModifyFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("recruitment and registration validation", () => {
  it("compares local date-time text without converting time zones", () => {
    // Given
    const values = {
      joinMethod: "APPROVAL",
      capacity: 5,
      startsAt: "2026-08-21T20:00",
      endsAt: "2026-08-21T19:00"
    };

    // When
    const result = recruitmentCreateFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });

  it("allows an omitted end time for always-open recruitment", () => {
    // Given
    const values = {
      joinMethod: "AUTO",
      capacity: 5,
      startsAt: "2026-08-21T20:00",
      endsAt: ""
    };

    // When
    const result = recruitmentCreateFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(true);
  });

  it("enforces the 1000-character registration message limit", () => {
    // Given
    const values = { message: "가".repeat(1001) };

    // When
    const result = registrationFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });

  it("does not send a reason for approval", () => {
    // Given
    const values = { status: "APPROVED", decisionReason: "승인 사유" };

    // When
    const result = registrationDecisionFormSchema.safeParse(values);

    // Then
    expect(result.success).toBe(false);
  });
});
