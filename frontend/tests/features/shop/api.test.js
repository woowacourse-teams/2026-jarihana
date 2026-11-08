import { createShopClient, shopApi } from "../../../src/features/shop/api.js";
import { apiClient } from "../../../src/shared/api/index.js";

jest.mock("../../../src/shared/api/index.js", () => ({ apiClient: { request: jest.fn() } }));
afterEach(() => jest.clearAllMocks());

it("구매 API에는 상품·조건·멱등 키만 전달하며 가격과 회원 ID는 보내지 않는다", async () => {
  apiClient.request.mockResolvedValue({ purchaseId: "receipt" });
  await shopApi.purchase({
    productId: "beanie",
    termsVersion: "v1",
    requestId: "uuid",
    price: 1,
    memberId: 99
  });
  expect(apiClient.request).toHaveBeenCalledWith(
    "members/me/shop/purchases",
    expect.objectContaining({
      method: "POST",
      json: { productId: "beanie", termsVersion: "v1", requestId: "uuid" }
    })
  );
});

it("실제 상점은 서버가 함께 읽은 잔액과 보유 상태를 사용하고 취소 신호를 전달한다", async () => {
  const signal = new AbortController().signal;
  apiClient.request.mockImplementation(async (path) =>
    path === "shop/products"
      ? { purchasingEnabled: true, products: [], categories: [] }
      : { wallet: { balance: 42, unit: "P" }, inventory: { items: [], equipped: {} } }
  );
  const state = await createShopClient().getSnapshot(signal);
  expect(state.wallet.balance).toBe(42);
  for (const [, options] of apiClient.request.mock.calls) expect(options.signal).toBe(signal);
});

it("실제 상점이 닫히면 체험 구매로 바꾸지 않고 구매 불가 오류를 반환한다", async () => {
  apiClient.request.mockResolvedValue({ purchasingEnabled: false });
  await expect(createShopClient().getSnapshot()).rejects.toMatchObject({
    code: "SHOP_UNAVAILABLE"
  });
});
