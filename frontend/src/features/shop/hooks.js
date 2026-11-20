import { useId } from "react";
import { useAuth } from "../auth/index.js";
import { shopApi } from "./api.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ownedItemsSchema,
  pointBalanceSchema,
  shopCatalogSchema,
  shopPurchaseResultSchema
} from "../../entities/shop/index.js";

export function useProfileEquipment() {
  const { member, sessionVersion, status, logoutPending } = useAuth();
  return useQuery({
    queryKey: ["shop-profile-equipment", member?.id, sessionVersion],
    queryFn: ({ signal }) => shopApi.profileEquipment(signal),
    enabled: Boolean(member?.id) && status === "authenticated" && !logoutPending,
    retry: false
  });
}

export function useShop(client) {
  const scope = useId();
  const queryClient = useQueryClient();
  // Scope both live and demo state to this mounted account session.
  const queryKey = ["shop-preview", scope];
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (client.getSnapshot) return client.getSnapshot(signal);
      const [catalog, wallet, inventory] = await Promise.all([
        client.getShopProducts(),
        client.getPointBalance(),
        client.getOwnedItems()
      ]);
      return {
        catalog: shopCatalogSchema.parse(catalog),
        wallet: pointBalanceSchema.parse(wallet),
        inventory: ownedItemsSchema.parse(inventory)
      };
    },
    staleTime: client.isLive ? 0 : Infinity,
    refetchOnWindowFocus: Boolean(client.isLive),
    gcTime: 0,
    retry: false
  });
  const purchase = useMutation({
    mutationFn: async (request) =>
      shopPurchaseResultSchema.parse(await client.purchaseProduct(request)),
    retry: false,
    onSuccess: async (result) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(
        queryKey,
        (current) => current && { ...current, wallet: result.wallet, inventory: result.inventory }
      );
      if (client.isLive) void queryClient.invalidateQueries({ queryKey: ["points"] });
    }
  });
  const equipment = useMutation({
    mutationFn: async (request) => ownedItemsSchema.parse(await client.setEquipment(request)),
    retry: false,
    onSuccess: async (inventory) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, (current) => current && { ...current, inventory });
      if (client.isLive) void queryClient.invalidateQueries({ queryKey: ["shop-profile-equipment"] });
    }
  });
  return { query, purchase, equipment };
}
