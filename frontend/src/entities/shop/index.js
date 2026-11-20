import { z } from "zod";
import { AVATAR_OPTIONS } from "../../../public/sparring-arena/src/avatar-appearance.js";

const points = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const previewSchema = z.object({
  type: z.enum(["avatar", "profile"]),
  art: z.enum([
    "beret",
    "cap",
    "beanie",
    "bucket",
    "bag",
    "coffee",
    "book",
    "glasses",
    "frame",
    "bearFrame",
    "title"
  ]),
  tone: z.enum(["mint", "coral", "cream", "lilac", "rose", "butter", "cocoa"]),
  appearance: z
    .object(
      Object.fromEntries(
        Object.entries(AVATAR_OPTIONS).map(([key, options]) => [key, z.enum(options)])
      )
    )
    .partial()
    .strict()
    .optional()
});
const slotSchema = z.enum(["hat", "bag", "handheld", "glasses", "frame", "title"]);
export const shopItemSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  categoryId: z.string(),
  slot: slotSchema,
  preview: previewSchema
});
export const shopProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  categoryId: z.string(),
  price: points,
  termsVersion: z.string().min(1),
  status: z.enum(["AVAILABLE", "ENDED"]),
  badge: z.string().optional(),
  preview: previewSchema,
  grant: z.object({ itemId: z.string().min(1), slot: slotSchema })
});
export const shopCatalogSchema = z.object({
  categories: z.array(z.object({ id: z.string(), label: z.string() })),
  products: z.array(shopProductSchema)
});
export const pointBalanceSchema = z.object({ balance: points, unit: z.literal("P") });
export const ownedItemsSchema = z.object({
  items: z.array(shopItemSchema),
  equipped: z.record(z.string(), z.string())
});
export const shopPurchaseResultSchema = z.object({
  purchaseId: z.string(),
  productId: z.string(),
  wallet: pointBalanceSchema,
  inventory: ownedItemsSchema
});

export const SHOP_ERROR_MESSAGES = Object.freeze({
  SHOP_UNAVAILABLE: "지금은 구매할 수 없어요. 잠시 후 다시 확인해 주세요.",
  INSUFFICIENT_POINTS: "포인트가 부족해요. 잔액을 다시 확인해 주세요.",
  ALREADY_OWNED: "이미 보유한 아이템이에요.",
  PRODUCT_UNAVAILABLE: "판매가 종료된 상품이에요.",
  TERMS_CHANGED: "가격이나 지급 내용이 바뀌었어요. 창을 닫고 새 조건을 확인해 주세요.",
  REQUEST_CONFLICT: "이 구매 요청의 정보가 일치하지 않아요. 창을 닫고 다시 시도해 주세요.",
  ITEM_NOT_OWNED: "보유한 아이템만 착용할 수 있어요."
});

export function purchaseBlockReason(product, wallet, inventory) {
  if (inventory.items.some((item) => item.itemId === product.grant.itemId)) return "ALREADY_OWNED";
  if (product.status !== "AVAILABLE") return "PRODUCT_UNAVAILABLE";
  if (wallet.balance < product.price) return "INSUFFICIENT_POINTS";
  return null;
}

export function formatPoints(value) {
  return `${value.toLocaleString("ko-KR")} P`;
}
