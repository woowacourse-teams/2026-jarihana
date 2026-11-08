import { z } from "zod";
import { apiClient } from "../../shared/api/index.js";
import {
  ownedItemsSchema,
  pointBalanceSchema,
  shopCatalogSchema,
  shopPurchaseResultSchema
} from "../../entities/shop/index.js";

const accountSchema = z.object({ wallet: pointBalanceSchema, inventory: ownedItemsSchema });
export const shopApi = {
  catalog: (signal) =>
    apiClient.request("shop/products", {
      schema: shopCatalogSchema.extend({ purchasingEnabled: z.boolean() }),
      signal
    }),
  account: (signal) => apiClient.request("members/me/shop", { schema: accountSchema, signal }),
  purchase: ({ productId, termsVersion, requestId }) =>
    apiClient.request("members/me/shop/purchases", {
      method: "POST",
      json: { productId, termsVersion, requestId },
      schema: shopPurchaseResultSchema
    })
};

export function createShopClient() {
  return {
    isLive: true,
    async getSnapshot(signal) {
      const [catalog, account] = await Promise.all([
        shopApi.catalog(signal),
        shopApi.account(signal)
      ]);
      if (!catalog.purchasingEnabled)
        throw Object.assign(new Error("Shop unavailable"), { code: "SHOP_UNAVAILABLE" });
      return { catalog, ...account };
    },
    purchaseProduct: shopApi.purchase
  };
}
