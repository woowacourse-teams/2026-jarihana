import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ownedItemsSchema,
  pointBalanceSchema,
  shopCatalogSchema,
  shopPurchaseResultSchema
} from "../../entities/shop/index.js";

export function useShop(client) {
  const scope = useId();
  const queryClient = useQueryClient();
  // Demo data is scoped to this mounted screen, never shared across accounts or visits.
  const queryKey = ["shop-preview", scope];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
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
    staleTime: Infinity,
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
    }
  });
  const equipment = useMutation({
    mutationFn: async (request) => ownedItemsSchema.parse(await client.setEquipment(request)),
    retry: false,
    onSuccess: async (inventory) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, (current) => current && { ...current, inventory });
    }
  });
  return { query, purchase, equipment };
}
