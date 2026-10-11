import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isInvitationId, isInvitationToken } from "../../entities/invitation";
import { ApiError } from "../../shared/api";
import { useAuth } from "../auth";
import { acceptInvitation, declineInvitation, fetchInvitation, fetchInvitationPreview } from "./api";

export function useInvitation({ invitationId, token }) {
  const { member, sessionVersion = 0, status } = useAuth();
  const link = token !== undefined;
  const valid = link ? isInvitationToken(token) : isInvitationId(invitationId);
  return useQuery({
    queryKey: ["invitations", member?.id ?? null, sessionVersion, link ? "link" : "direct", token ?? invitationId],
    enabled: valid && (link || status === "authenticated"),
    queryFn: async ({ signal }) => {
      if (link) return fetchInvitationPreview(token, undefined, signal);
      const detail = await fetchInvitation(invitationId, undefined, signal);
      if (detail.type !== "DIRECT" || detail.id !== Number(invitationId)) {
        throw new ApiError({ code: "INVITATION_NOT_FOUND", status: 404 });
      }
      return detail;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0
  });
}

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId, token }) => acceptInvitation(invitationId, token),
    retry: false,
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ["invitations"] }),
      client.invalidateQueries({ queryKey: ["groups"] }),
      client.invalidateQueries({ queryKey: ["group-members"] }),
      client.invalidateQueries({ queryKey: ["registrations"] })
    ])
  });
}

export function useDeclineInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId }) => declineInvitation(invitationId),
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: ["invitations"] })
  });
}
