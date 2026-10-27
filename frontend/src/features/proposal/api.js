import {
  proposalCommentCreateResponseSchema,
  proposalCommentPageSchema,
  proposalCreateResponseSchema,
  proposalDetailSchema,
  proposalPageSchema
} from "../../entities/proposal/index.js";
import { apiRequest } from "../../shared/api/index.js";

export function fetchProposals({ category, cursor, size = 20 } = {}) {
  return apiRequest("proposals", {
    searchParams: {
      ...(category ? { category } : {}),
      ...(cursor ? { cursor } : {}),
      size
    },
    schema: proposalPageSchema
  });
}

export function fetchProposal(proposalId) {
  return apiRequest(`proposals/${proposalId}`, { schema: proposalDetailSchema });
}

export function createProposal(values) {
  return apiRequest("proposals", {
    method: "post",
    json: values,
    schema: proposalCreateResponseSchema
  });
}

// 본문 없는 204 응답이라 응답 스키마를 검사하지 않는다.
export function deleteProposal(proposalId) {
  return apiRequest(`proposals/${proposalId}`, { method: "delete" });
}

/** 조건을 모두 비우면 목록에서 마음만 보내는 응답이 된다. */
export function saveProposalInterest(proposalId, { timeSlots = [], meetingModes = [], moodIndexes = [] } = {}) {
  return apiRequest(`proposals/${proposalId}/interest`, {
    method: "put",
    json: { timeSlots, meetingModes, moodIndexes }
  });
}

export function removeProposalInterest(proposalId) {
  return apiRequest(`proposals/${proposalId}/interest`, { method: "delete" });
}

export function fetchProposalComments({ proposalId, cursor, size = 20 }) {
  return apiRequest(`proposals/${proposalId}/comments`, {
    searchParams: { ...(cursor ? { cursor } : {}), size },
    schema: proposalCommentPageSchema
  });
}

export function createProposalComment(proposalId, content) {
  return apiRequest(`proposals/${proposalId}/comments`, {
    method: "post",
    json: { content },
    schema: proposalCommentCreateResponseSchema
  });
}

export function deleteProposalComment(commentId) {
  return apiRequest(`proposal-comments/${commentId}`, { method: "delete" });
}
