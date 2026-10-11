import { invitationAcceptanceSchema, invitationDetailSchema, invitationPreviewSchema } from "../../entities/invitation";
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
