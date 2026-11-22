import { useMutation, useQuery } from "@tanstack/react-query";
import { installAssetDefinitions } from "./assetDefinitions.js";
import { installFurnitureCatalog } from "./furnitureCatalog.js";
import { fetchAssetDefinitions, fetchFurnitureCatalog, fetchGroupSpace, saveGroupSpace } from "./api.js";

export const groupSpaceKeys = {
  detail: (groupId, memberId) => ["group-space", String(groupId), memberId]
};

export const furnitureCatalogQuery = {
  queryKey: ["space-furniture-catalog"],
  queryFn: async () => {
    const [catalog, definitions] = await Promise.all([fetchFurnitureCatalog(), fetchAssetDefinitions()]);
    installAssetDefinitions(definitions);
    return installFurnitureCatalog(catalog.items);
  },
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
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
