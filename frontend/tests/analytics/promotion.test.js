import {
  clearPromotionAttribution,
  getPromotionAttribution,
  syncPromotionAttribution
} from "../../src/shared/analytics/promotion";

afterEach(() => {
  clearPromotionAttribution();
});

test("stores the first valid promotion for a group and keeps it during navigation", () => {
  expect(syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01")).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
  expect(syncPromotionAttribution("13", "?promotion_id=another_campaign")).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
  expect(getPromotionAttribution(13)).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
});

test("does not attribute malformed or duplicated promotion identifiers", () => {
  expect(syncPromotionAttribution("13", "?promotion_id=bad%3Femail%3Dprivate")).toBeUndefined();
  expect(syncPromotionAttribution("13", "?promotion_id=valid&promotion_id=other")).toBeUndefined();
  expect(getPromotionAttribution("13")).toBeUndefined();
});

test("clears the previous group attribution before storing a new group's promotion", () => {
  syncPromotionAttribution("13", "?promotion_id=first_campaign");

  expect(syncPromotionAttribution("14", "")).toBeUndefined();
  expect(syncPromotionAttribution("14", "?promotion_id=second_campaign")).toEqual({
    group_id: "14",
    promotion_id: "second_campaign"
  });
  expect(getPromotionAttribution("13")).toBeUndefined();
});

test("keeps attribution while visiting a non-group route for an auth flow", () => {
  syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01");

  expect(syncPromotionAttribution(undefined, "?code=private&state=private")).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
});

test("does not carry attribution into an invalid group route", () => {
  syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01");

  expect(syncPromotionAttribution("not-a-group", "")).toBeUndefined();
  expect(getPromotionAttribution("13")).toBeUndefined();
});
