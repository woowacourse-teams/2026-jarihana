import { groupDetailSchema, groupListPageSchema } from "../../src/entities/group/index.js";
import { memberProfileSchema } from "../../src/entities/member/index.js";
import {
  recruitmentCloseResponseSchema,
  recruitmentDetailSchema
} from "../../src/entities/recruitment/index.js";
import {
  registrationDecisionResponseSchema,
  registrationPageSchema,
  registrationSummarySchema
} from "../../src/entities/registration/index.js";

describe("backend DTO schemas", () => {
  it("parses nullable group detail fields without filling them", () => {
    // Given
    const payload = {
      id: 1,
      type: "STUDY",
      status: "ACTIVE",
      name: "리액트 스터디",
      introduction: "함께 공부해요",
      description: null,
      meetingType: "FLEXIBLE",
      location: null,
      representativeImageUrl: "/images/default-group.png",
      recurringSchedule: null,
      sessionSchedule: null,
      leader: null,
      memberCount: 0,
      activeRecruitment: null,
      createdAt: "2026-08-21T10:30:00"
    };

    // When
    const result = groupDetailSchema.parse(payload);

    // Then
    expect(result).toEqual(payload);
  });

  it("rejects unknown group enum values", () => {
    // Given
    const payload = {
      items: [
        {
          id: 1,
          type: "PROJECT",
          status: "ACTIVE",
          name: "잘못된 타입",
          introduction: "계약에 없는 타입",
          representativeImageUrl: "/images/default-group.png",
          leader: null,
          memberCount: 0,
          activeRecruitment: null
        }
      ],
      nextCursor: null,
      hasNext: false
    };

    // When
    const result = groupListPageSchema.safeParse(payload);

    // Then
    expect(result.success).toBe(false);
  });

  it("requires meeting type in group detail responses", () => {
    // Given
    const payload = {
      id: 1,
      type: "STUDY",
      status: "ACTIVE",
      name: "유동적 스터디",
      introduction: "모임 방식을 반드시 표시해요",
      description: null,
      meetingType: null,
      location: null,
      representativeImageUrl: "/images/default-group.png",
      recurringSchedule: null,
      sessionSchedule: null,
      leader: null,
      memberCount: 0,
      activeRecruitment: null,
      createdAt: "2026-08-21T10:30:00"
    };

    // When
    const result = groupDetailSchema.safeParse(payload);

    // Then
    expect(result.success).toBe(false);
  });

  it("preserves a null representative image for the UI fallback", () => {
    // Given
    const payload = {
      items: [
        {
          id: 1,
          type: "CLUB",
          status: "ACTIVE",
          name: "이미지 없는 모임",
          introduction: "기본 이미지를 사용해요",
          representativeImageUrl: null,
          leader: null,
          memberCount: 0,
          activeRecruitment: null
        }
      ],
      nextCursor: null,
      hasNext: false
    };

    // When
    const result = groupListPageSchema.parse(payload);

    // Then
    expect(result.items[0].representativeImageUrl).toBeNull();
  });

  it.each([
    ["images/default-group.png", "/images/default-group.png"],
    ["/images/default-group.png", "/images/default-group.png"],
    ["https://cdn.example.com/group.png", "https://cdn.example.com/group.png"],
    ["http://cdn.example.com/group.png", "http://cdn.example.com/group.png"],
    [null, null]
  ])("normalizes a representative image boundary value %s", (representativeImageUrl, expected) => {
    // Given
    const payload = {
      items: [
        {
          id: 1,
          type: "CLUB",
          status: "ACTIVE",
          name: "이미지 경로 모임",
          introduction: "깊은 경로에서도 이미지를 보여요",
          representativeImageUrl,
          leader: null,
          memberCount: 0,
          activeRecruitment: null
        }
      ],
      nextCursor: null,
      hasNext: false
    };

    // When
    const result = groupListPageSchema.parse(payload);

    // Then
    expect(result.items[0].representativeImageUrl).toBe(expected);
  });

  it("parses both mapped and raw upcoming recruitment close statuses", () => {
    // Given
    const scheduled = { id: 3, endsAt: "2026-08-21T12:00:00", recruitingStatus: "SCHEDULED" };
    const upcoming = { id: 3, endsAt: "2026-08-21T12:00:00", recruitingStatus: "UPCOMING" };

    // When
    const scheduledResult = recruitmentCloseResponseSchema.safeParse(scheduled);
    const upcomingResult = recruitmentCloseResponseSchema.safeParse(upcoming);

    // Then
    expect([scheduledResult.success, upcomingResult.success]).toEqual([true, true]);
  });

  it("preserves nullable recruitment end time", () => {
    // Given
    const payload = {
      id: 9,
      group: { id: 1, name: "상시 모집", status: "ACTIVE" },
      joinMethod: "AUTO",
      capacity: 20,
      approvedCount: 4,
      remainingSeats: 16,
      startsAt: "2026-08-21T10:00:00",
      endsAt: null,
      recruitingStatus: "ALWAYS_OPEN",
      createdAt: "2026-08-20T09:00:00"
    };

    // When
    const result = recruitmentDetailSchema.parse(payload);

    // Then
    expect(result.endsAt).toBeNull();
  });

  it("accepts omitted nullable create-registration decision fields", () => {
    // Given
    const payload = {
      items: [
        {
          id: 2,
          member: { id: 4, crewName: "자리", generation: 2, course: "FRONTEND" },
          message: null,
          status: "PENDING",
          registeredAt: "2026-08-21T11:00:00",
          decisionReason: null,
          decidedAt: null,
          decidedBy: null
        }
      ],
      nextCursor: null,
      hasNext: false
    };

    // When
    const result = registrationPageSchema.parse(payload);

    // Then
    expect(result.items[0].decidedBy).toBeNull();
  });

  it("rejects APPROVE because the backend decision is APPROVED", () => {
    // Given
    const payload = {
      id: 2,
      status: "APPROVE",
      decisionReason: null,
      decidedAt: "2026-08-21T11:30:00",
      decidedBy: { type: "MEMBER", memberId: 1 }
    };

    // When
    const result = registrationDecisionResponseSchema.safeParse(payload);

    // Then
    expect(result.success).toBe(false);
  });

  it("accepts the group registration summary contract with a nullable target", () => {
    // Given
    const payload = {
      unreadCount: 7,
      pendingCount: 123,
      targetRecruitmentId: null,
      latestRegistrationId: 91
    };

    // When
    const result = registrationSummarySchema.parse(payload);

    // Then
    expect(result).toEqual(payload);
  });

  it("distinguishes signup session from a completed member profile", () => {
    // Given
    const signupSession = { signupCompleted: false, member: null };

    // When
    const result = memberProfileSchema.parse(signupSession);

    // Then
    expect(result.signupCompleted).toBe(false);
  });
});
