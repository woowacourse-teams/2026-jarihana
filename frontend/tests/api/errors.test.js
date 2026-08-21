import { toUserMessage } from "../../src/shared/api";

describe("safe API error messages", () => {
  test.each([
    ["INVALID_PARAMETER", "입력한 내용을 다시 확인해 주세요."],
    ["UNAUTHENTICATED", "로그인이 필요해요."],
    ["SIGNUP_SESSION_REQUIRED", "가입 세션이 만료되었어요. 다시 로그인해 주세요."],
    ["REFRESH_TOKEN_REQUIRED", "로그인이 만료되었어요. 다시 로그인해 주세요."],
    ["REFRESH_TOKEN_INVALID", "로그인이 만료되었어요. 다시 로그인해 주세요."],
    ["ACCESS_DENIED", "이 작업을 수행할 권한이 없어요."],
    ["GROUP_ACCESS_DENIED", "이 모임을 관리할 권한이 없어요."],
    ["RECRUITMENT_ACCESS_DENIED", "이 모집을 관리할 권한이 없어요."],
    ["REGISTRATION_ACCESS_DENIED", "이 신청을 처리할 권한이 없어요."],
    ["MEMBER_NOT_FOUND", "회원 정보를 찾을 수 없어요."],
    ["GROUP_NOT_FOUND", "모임을 찾을 수 없어요."],
    ["GROUP_MEMBER_NOT_FOUND", "모임 구성원을 찾을 수 없어요."],
    ["RECRUITMENT_NOT_FOUND", "모집 정보를 찾을 수 없어요."],
    ["REGISTRATION_NOT_FOUND", "신청 정보를 찾을 수 없어요."],
    ["RECURRING_SCHEDULE_NOT_FOUND", "등록된 정기 일정을 찾을 수 없어요."],
    ["IMAGE_NOT_FOUND", "이미지를 찾을 수 없어요."],
    ["SCHEDULE_TYPE_MISMATCH", "모임 유형에 맞는 일정을 입력해 주세요."],
    ["SCHEDULE_REQUIRED", "모임 일정이 필요해요."],
    ["SCHEDULE_INVALID_RULE", "모임 일정 규칙을 다시 확인해 주세요."],
    ["GROUP_NAME_DUPLICATED", "이미 사용 중인 모임 이름이에요."],
    ["GROUP_ENDED", "이미 종료된 모임이에요."],
    ["GROUP_MEMBER_ALREADY_EXISTS", "이미 참여 중인 모임이에요."],
    ["GROUP_DELETE_WINDOW_EXPIRED", "모임 생성 후 24시간이 지나 삭제할 수 없어요."],
    ["GROUP_TERMINATION_NOT_AVAILABLE", "지금은 모임을 종료할 수 없어요."],
    ["GROUP_ALREADY_ENDED", "이미 종료된 모임이에요."],
    ["MEMBER_ALREADY_EXISTS", "이미 가입된 회원이에요."],
    ["REGISTRATION_ALREADY_EXISTS", "이미 신청한 모집이에요."],
    ["MEMBER_CREW_DUPLICATED", "이미 사용 중인 크루명이에요."],
    ["RECRUITMENT_ALREADY_CLOSED", "이미 마감된 모집이에요."],
    ["RECRUITMENT_INVALID_PERIOD", "모집 기간을 다시 확인해 주세요."],
    ["RECRUITMENT_NOT_OPEN", "현재 신청할 수 없는 모집이에요."],
    ["RECRUITMENT_CAPACITY_EXCEEDED", "모집 정원이 모두 찼어요."],
    ["REGISTRATION_ALREADY_DECIDED", "이미 처리된 신청이에요."],
    ["GROUP_PENDING_REGISTRATION_EXISTS", "이미 처리 중인 가입 신청이 있어요."],
    ["GROUP_MEMBER_ALREADY_LEADER", "이미 모임장인 구성원이에요."],
    [
      "LEADER_DELEGATION_NOT_ALLOWED_FOR_ENDED_GROUP",
      "종료된 모임에서는 모임장을 위임할 수 없어요."
    ],
    ["OAUTH_PROVIDER_ERROR", "GitHub 로그인에 실패했어요. 잠시 후 다시 시도해 주세요."],
    ["OAUTH_INVALID_CALLBACK", "GitHub 로그인 응답을 확인할 수 없어요. 다시 시도해 주세요."],
    ["OAUTH_STATE_INVALID", "로그인 요청을 확인할 수 없어요. 다시 시도해 주세요."],
    ["INTERNAL_ERROR", "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."],
    ["UNKNOWN_SERVER_DETAIL", "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."]
  ])(
    "Given error code %s, when mapping it, then it returns a safe Korean message",
    (code, expected) => {
      // Given / When
      const message = toUserMessage(code);

      // Then
      expect(message).toBe(expected);
    }
  );
});
