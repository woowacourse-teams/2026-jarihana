import {
  ownedItemsSchema,
  pointBalanceSchema,
  purchaseBlockReason,
  shopCatalogSchema,
  shopPurchaseResultSchema
} from "../../entities/shop/index.js";

const product = (
  id,
  name,
  description,
  categoryId,
  price,
  art,
  tone,
  slot,
  appearance,
  extra = {}
) => ({
  id,
  name,
  description,
  categoryId,
  price,
  termsVersion: "demo-1",
  status: "AVAILABLE",
  preview: {
    type: categoryId === "profile" ? "profile" : "avatar",
    art,
    tone,
    ...(appearance ? { appearance } : {})
  },
  grant: { itemId: `demo-item-${id}`, slot },
  ...extra
});

// Example offers only. Existing avatar parts remain free in the real editor.
const DEMO_CATALOG = shopCatalogSchema.parse({
  categories: [
    { id: "wear", label: "아바타 꾸미기" },
    { id: "profile", label: "프로필 꾸미기" }
  ],
  products: [
    product(
      "beret",
      "민트 베레모",
      "살짝 기울여 쓰는 둥근 민트색 모자.",
      "wear",
      300,
      "beret",
      "mint",
      "hat",
      { hat: "beret", hatColor: "mint" },
      { badge: "추천" }
    ),
    product(
      "bag",
      "코랄 크로스백",
      "어깨에 가볍게 걸치는 코랄색 가방.",
      "wear",
      450,
      "bag",
      "coral",
      "bag",
      { bag: "crossbody", bagColor: "coral" }
    ),
    product(
      "coffee",
      "시원한 커피 한 잔",
      "얼음 가득, 한 손에 쏙. 들고 다니는 아이스 커피.",
      "wear",
      150,
      "coffee",
      "cream",
      "handheld",
      { handheld: "icedCoffee" }
    ),
    product(
      "book",
      "늘 함께하는 책",
      "읽던 곳에 책갈피를 끼워둔 보라색 책.",
      "wear",
      200,
      "book",
      "lilac",
      "handheld",
      { handheld: "book" }
    ),
    product(
      "cap",
      "처음의 민트 캡",
      "처음부터 가지고 있는 기본 모자. 편하게 써보세요.",
      "wear",
      250,
      "cap",
      "mint",
      "hat",
      { hat: "cap", hatColor: "mint" }
    ),
    product(
      "frame",
      "반짝이는 내 자리",
      "프로필 테두리에 별을 더하는 장식 프레임.",
      "profile",
      1800,
      "frame",
      "lilac",
      "frame"
    ),
    product(
      "title",
      "함께하는 즐거움",
      "이름 옆에 달 수 있는 작은 메달 모양 칭호.",
      "profile",
      400,
      "title",
      "cream",
      "title"
    ),
    product(
      "glasses",
      "여름의 선글라스",
      "햇빛을 가려주는 둥근 검정 선글라스.",
      "wear",
      350,
      "glasses",
      "coral",
      "glasses",
      { glasses: "sunglasses" },
      { status: "ENDED" }
    )
  ]
});

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

/**
 * Browser-memory implementation of the proposed ShopClient contract.
 * Replace the entire adapter with authenticated domain API calls after agreement.
 * A new instance resets all sample points, purchases and equipment; nothing is persisted.
 */
export function createDemoShopClient({
  initialBalance = 1200,
  initialItemIds = ["demo-item-cap"]
} = {}) {
  let wallet = pointBalanceSchema.parse({ balance: initialBalance, unit: "P" });
  const toOwnedItem = (offer) => ({
    ...offer.grant,
    name: offer.name,
    description: offer.description,
    categoryId: offer.categoryId,
    preview: offer.preview
  });
  let inventory = ownedItemsSchema.parse({
    items: DEMO_CATALOG.products
      .filter((offer) => initialItemIds.includes(offer.grant.itemId))
      .map(toOwnedItem),
    equipped: {}
  });
  const purchases = new Map();
  const clone = (value) => JSON.parse(JSON.stringify(value));

  return {
    async getShopProducts() {
      return clone(DEMO_CATALOG);
    },
    async getPointBalance() {
      return clone(wallet);
    },
    async getOwnedItems() {
      return clone(inventory);
    },
    async purchaseProduct({ productId, termsVersion, requestId }) {
      if (!requestId) fail("REQUEST_CONFLICT");
      const signature = JSON.stringify([productId, termsVersion]);
      const previous = purchases.get(requestId);
      if (previous) {
        if (previous.signature !== signature) fail("REQUEST_CONFLICT");
        return clone(previous.result);
      }
      const offer = DEMO_CATALOG.products.find((item) => item.id === productId);
      if (!offer) fail("PRODUCT_UNAVAILABLE");
      if (offer.termsVersion !== termsVersion) fail("TERMS_CHANGED");
      const reason = purchaseBlockReason(offer, wallet, inventory);
      if (reason) fail(reason);
      // No await between validation and commit: one atomic operation in this demo.
      const result = shopPurchaseResultSchema.parse({
        purchaseId: `demo-purchase-${purchases.size + 1}`,
        productId,
        wallet: { ...wallet, balance: wallet.balance - offer.price },
        inventory: { ...inventory, items: [...inventory.items, toOwnedItem(offer)] }
      });
      wallet = result.wallet;
      inventory = result.inventory;
      purchases.set(requestId, { signature, result });
      return clone(result);
    },
    async setEquipment({ itemId, equipped }) {
      const owned = inventory.items.find((item) => item.itemId === itemId);
      if (!owned) fail("ITEM_NOT_OWNED");
      const next = { ...inventory.equipped };
      if (equipped) next[owned.slot] = itemId;
      else if (next[owned.slot] === itemId) delete next[owned.slot];
      inventory = ownedItemsSchema.parse({ ...inventory, equipped: next });
      return clone(inventory);
    }
  };
}
