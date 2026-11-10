import { createDemoShopClient } from "../../../src/features/shop/demoClient.js";

const request = (productId = "beret", requestId = "purchase-1") => ({
  productId,
  requestId,
  termsVersion: "demo-1"
});

it("같은 구매 재시도는 한 번만 차감·지급하고 요청 키 재사용을 검사한다", async () => {
  const client = createDemoShopClient();
  const result = await client.purchaseProduct(request());
  expect(await client.purchaseProduct(request())).toEqual(result);
  expect(await client.getPointBalance()).toEqual({ balance: 900, unit: "P" });
  expect(
    (await client.getOwnedItems()).items.filter((item) => item.itemId === "demo-item-beret")
  ).toHaveLength(1);
  await expect(client.purchaseProduct(request("book"))).rejects.toMatchObject({
    code: "REQUEST_CONFLICT"
  });
  await expect(client.purchaseProduct(request("beret", "different"))).rejects.toMatchObject({
    code: "ALREADY_OWNED"
  });
});

it("동시에 다른 상품을 구매해도 잔액보다 많이 사용하지 않는다", async () => {
  const client = createDemoShopClient({ initialBalance: 500 });
  const outcomes = await Promise.allSettled([
    client.purchaseProduct(request()),
    client.purchaseProduct(request("bag", "purchase-2"))
  ]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find((result) => result.status === "rejected").reason.code).toBe(
    "INSUFFICIENT_POINTS"
  );
  expect((await client.getPointBalance()).balance).toBe(200);
  expect((await client.getOwnedItems()).items.map((item) => item.itemId)).toEqual([
    "demo-item-cap",
    "demo-item-beret"
  ]);
});

it.each([
  [request("frame"), "INSUFFICIENT_POINTS"],
  [request("glasses"), "PRODUCT_UNAVAILABLE"],
  [{ ...request(), termsVersion: "old" }, "TERMS_CHANGED"]
])("구매 거절은 포인트와 보유 상태를 변경하지 않는다: %s", async (input, code) => {
  const client = createDemoShopClient();
  await expect(client.purchaseProduct(input)).rejects.toMatchObject({ code });
  expect((await client.getPointBalance()).balance).toBe(1200);
  expect((await client.getOwnedItems()).items.map((item) => item.itemId)).toEqual([
    "demo-item-cap"
  ]);
});

it("같은 슬롯은 교체하고 해제해도 소유권을 유지하며 미보유 착용을 거부한다", async () => {
  const client = createDemoShopClient();
  await expect(
    client.setEquipment({ itemId: "demo-item-beret", equipped: true })
  ).rejects.toMatchObject({ code: "ITEM_NOT_OWNED" });
  await client.purchaseProduct(request());
  await client.setEquipment({ itemId: "demo-item-cap", equipped: true });
  await client.setEquipment({ itemId: "demo-item-beret", equipped: true });
  expect((await client.getOwnedItems()).equipped).toEqual({ hat: "demo-item-beret" });
  await client.setEquipment({ itemId: "demo-item-beret", equipped: false });
  expect((await client.getOwnedItems()).equipped).toEqual({});
  expect((await client.getOwnedItems()).items.map((item) => item.itemId)).toEqual([
    "demo-item-cap",
    "demo-item-beret"
  ]);
});

it("다른 세션과 반환값 변경은 체험 잔액·보유 데이터에 영향을 주지 않는다", async () => {
  const client = createDemoShopClient();
  (await client.getShopProducts()).products[0].price = 0;
  (await client.getOwnedItems()).items.length = 0;
  await client.purchaseProduct(request());
  expect((await client.getPointBalance()).balance).toBe(900);
  const nextSession = createDemoShopClient();
  expect((await nextSession.getPointBalance()).balance).toBe(1200);
  expect((await nextSession.getOwnedItems()).items.map((item) => item.itemId)).toEqual([
    "demo-item-cap"
  ]);
});
