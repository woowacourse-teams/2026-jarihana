import { createdInvitationSchema, invitationCandidatePageSchema, issuedInvitationPageSchema, revokedInvitationSchema, invitationAcceptanceSchema, invitationDetailSchema, invitationPreviewSchema } from "../../entities/invitation";
import { apiClient, ApiError } from "../../shared/api";

export const fetchInvitation = (id, client = apiClient, signal) => client.request(`invitations/${id}`, {
  schema: invitationDetailSchema, signal, cache: "no-store"
});
export const fetchInvitationPreview = (token, client = apiClient, signal) => client.request(`invitations/links/${encodeURIComponent(token)}`, {
  schema: invitationPreviewSchema, signal, cache: "no-store", authRetry: false
});
export async function acceptInvitation(id, token, client = apiClient) {
  const result = await client.request(`invitations/${id}/acceptances`, {
    method: "POST", json: token ? { token } : {}, schema: invitationAcceptanceSchema, cache: "no-store"
  });
  if (result.invitationId !== Number(id)) throw new ApiError({ code: "INVALID_RESPONSE", status: 200 });
  return result;
}

export const declineInvitation = (invitationId, client = apiClient) => client.request(`invitations/${invitationId}/decline`, {
  method: "PATCH", cache: "no-store"
});

function invitationPageParams({ cursor, ...filters } = {}) {
  return { ...filters, ...(cursor ? { cursor } : {}) };
}

export const fetchInvitationCandidates = (groupId, searchParams, client = apiClient, signal) => client.request(`groups/${groupId}/invitation-candidates`, {
  searchParams: invitationPageParams(searchParams), signal, schema: invitationCandidatePageSchema, cache: "no-store"
});
export const fetchIssuedInvitations = (groupId, searchParams, client = apiClient, signal) => client.request(`groups/${groupId}/invitations`, {
  searchParams: invitationPageParams(searchParams), signal, schema: issuedInvitationPageSchema, cache: "no-store"
});
export async function createInvitation(groupId, command, client = apiClient) {
  const result = await client.request(`groups/${groupId}/invitations`, {
    method: "POST", json: command, schema: createdInvitationSchema, cache: "no-store"
  });
  if (result.groupId !== Number(groupId) || result.type !== command.type
      || result.targetMemberId !== (command.targetMemberId ?? null)) {
    throw new ApiError({ code: "INVALID_RESPONSE", status: 200 });
  }
  const expectedPath = result.type === "LINK"
    ? /^\/invitations\/link\/[A-Za-z0-9_-]{43}$/
    : new RegExp(`^/invitations/${result.id}$`);
  if (!expectedPath.test(result.sharePath)) throw new ApiError({ code: "INVALID_RESPONSE", status: 200 });
  return result;
}
export async function revokeInvitation(invitationId, client = apiClient) {
  const result = await client.request(`invitations/${invitationId}/revoke`, {
    method: "PATCH", schema: revokedInvitationSchema, cache: "no-store"
  });
  if (result.id !== Number(invitationId)) throw new ApiError({ code: "INVALID_RESPONSE", status: 200 });
  return result;
}
export function sharedInvitationUrl(path, origin = window.location.origin) {
  if (!/^\/invitations\/link\/[A-Za-z0-9_-]{43}$/.test(path)) {
    throw new ApiError({ code: "INVALID_RESPONSE", status: 200 });
  }
  return new URL(path, origin).href;
}
