import {
  recruitmentCloseResponseSchema,
  recruitmentCreateResponseSchema,
  recruitmentDetailSchema,
  recruitmentListPageSchema,
  recruitmentUpdateResponseSchema
} from "../../entities/recruitment/index.js";
import { apiRequest } from "../../shared/api/index.js";

function buildPageParams(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
  );
}

export function fetchRecruitments(groupId, filters = {}) {
  return apiRequest(`groups/${groupId}/recruitments`, {
    searchParams: buildPageParams(filters),
    schema: recruitmentListPageSchema
  });
}

export function fetchRecruitment(groupId, recruitmentId) {
  return apiRequest(`groups/${groupId}/recruitments/${recruitmentId}`, {
    schema: recruitmentDetailSchema
  });
}

export function createRecruitment(groupId, values) {
  return apiRequest(`groups/${groupId}/recruitments`, {
    method: "post",
    json: values,
    schema: recruitmentCreateResponseSchema
  });
}

export function updateRecruitment(groupId, recruitmentId, values) {
  return apiRequest(`groups/${groupId}/recruitments/${recruitmentId}`, {
    method: "put",
    json: values,
    schema: recruitmentUpdateResponseSchema
  });
}

export function closeRecruitment(groupId, recruitmentId) {
  return apiRequest(`groups/${groupId}/recruitments/${recruitmentId}`, {
    method: "patch",
    json: { recruitingStatus: "CLOSED" },
    schema: recruitmentCloseResponseSchema
  });
}
