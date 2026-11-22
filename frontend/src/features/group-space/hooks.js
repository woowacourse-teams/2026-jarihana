import { useMutation, useQuery } from "@tanstack/react-query";
import { installSpaceCatalog } from "./furnitureCatalog.js";
import { fetchFurnitureCatalog, fetchGroupSpace, saveGroupSpace } from "./api.js";

export const groupSpaceKeys = {
  detail: (groupId, memberId) => ["group-space", String(groupId), memberId]
};

export const furnitureCatalogQuery = {
  queryKey: ["space-furniture-catalog"],
  queryFn: async ({ signal }) => {
    const catalog = await fetchFurnitureCatalog(signal);
    signal.throwIfAborted();
    installSpaceCatalog(catalog);
    return catalog;
  },
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: ({ state }) => state.status === "error" && state.data !== undefined ? 3000 : false,
  retry: false
};

export function useFurnitureCatalog() {
  return useQuery(furnitureCatalogQuery);
}

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

export function useSaveGroupSpace(groupId, previousRoom) {
  return useMutation({
    mutationFn: (values) => saveGroupSpace(groupId, values, previousRoom)
  });
}
