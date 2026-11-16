import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchGroupSpace, saveGroupSpace } from "./api.js";

export const groupSpaceKeys = {
  detail: (groupId, memberId) => ["group-space", String(groupId), memberId]
};

export function useGroupSpace(groupId, memberId) {
  return useQuery({
    queryKey: groupSpaceKeys.detail(groupId, memberId),
    queryFn: () => fetchGroupSpace(groupId),
    enabled: Boolean(groupId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
}

export function useSaveGroupSpace(groupId) {
  return useMutation({
    mutationFn: (values) => saveGroupSpace(groupId, values)
  });
}
