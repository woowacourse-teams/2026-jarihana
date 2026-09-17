import {
  clearPromotionAttribution,
  getPromotionAttribution,
  getPromotionEntryId,
  syncPromotionAttribution
} from "../../src/shared/analytics/promotion";

const firstSession = "session-first";
const nextSession = "session-next";

afterEach(() => {
  clearPromotionAttribution();
});

test("reads only one valid promotion identifier from the current URL", () => {
  expect(getPromotionEntryId("?promotion_id=yutnori_chat_01")).toBe("yutnori_chat_01");
  expect(getPromotionEntryId("?promotion_id=bad%3Femail%3Dprivate")).toBeUndefined();
  expect(getPromotionEntryId("?promotion_id=valid&promotion_id=other")).toBeUndefined();
});

test("keeps the first valid promotion for conversion attribution in the same session", () => {
  expect(syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01", firstSession)).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
  expect(syncPromotionAttribution("13", "?promotion_id=another_campaign", firstSession)).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
  expect(getPromotionAttribution(13, firstSession)).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
});

test("keeps attribution while visiting a non-group route in the same session", () => {
  syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01", firstSession);

  expect(syncPromotionAttribution(undefined, "?code=private&state=private", firstSession)).toEqual({
    group_id: "13",
    promotion_id: "yutnori_chat_01"
  });
});

test("does not reuse attribution after the PostHog session changes", () => {
  syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01", firstSession);

  expect(syncPromotionAttribution("13", "", nextSession)).toBeUndefined();
  expect(getPromotionAttribution("13", nextSession)).toBeUndefined();
});

test("clears the previous group attribution before storing a new group's promotion", () => {
  syncPromotionAttribution("13", "?promotion_id=first_campaign", firstSession);

  expect(syncPromotionAttribution("14", "", firstSession)).toBeUndefined();
  expect(syncPromotionAttribution("14", "?promotion_id=second_campaign", firstSession)).toEqual({
    group_id: "14",
    promotion_id: "second_campaign"
  });
  expect(getPromotionAttribution("13", firstSession)).toBeUndefined();
});

test("does not store attribution without a valid analytics session", () => {
  expect(
    syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01", "invalid?session")
  ).toBeUndefined();
  expect(getPromotionAttribution("13", firstSession)).toBeUndefined();
});

test("does not carry attribution into an invalid group route", () => {
  syncPromotionAttribution("13", "?promotion_id=yutnori_chat_01", firstSession);

  expect(syncPromotionAttribution("not-a-group", "", firstSession)).toBeUndefined();
  expect(getPromotionAttribution("13", firstSession)).toBeUndefined();
});
