import {
  groupMemberPageSchema,
  memberSignupResponseSchema,
  transferLeaderResponseSchema
} from "../../entities/member/index.js";
import { apiRequest } from "../../shared/api/index.js";
import { memberSignupFormSchema } from "./validation.js";

function buildPageParams(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}

export function fetchMembers(groupId, filters = {}) {
  return apiRequest(`groups/${groupId}/members`, {
    searchParams: buildPageParams(filters),
    schema: groupMemberPageSchema
  });
}

export function transferLeader(groupId, groupMemberId) {
  return apiRequest(`groups/${groupId}/leader`, {
    method: "put",
    json: { groupMemberId },
    schema: transferLeaderResponseSchema
  });
}

export function signupMember(values) {
  const signup = memberSignupFormSchema.parse(values);
  return apiRequest("members", {
    method: "post",
    json: signup,
    schema: memberSignupResponseSchema,
    skipAuthRefresh: true
  });
}
