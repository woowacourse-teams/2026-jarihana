import { exhibitRecords, memoryForExhibit } from "./activityExhibit";

const item = { id: "frame", kind: "memory", title: "old private title", photo: "old private photo", link: "/groups/7/space?panel=activities&activity=12" };
const record = { id: 12, title: "current title", photo: "current photo", link: "/groups/7?activity=12" };

test("linked memories use live authorized records without changing saved furniture", () => {
  expect(memoryForExhibit(item, { status: "ready", records: [record] })).toEqual({ ...item, title: record.title, photo: record.photo });
  expect(item.photo).toBe("old private photo");
  expect(memoryForExhibit(item, undefined)).toBe(item);
});

test.each(["loading", "error", "denied"])("%s cannot show stale records supplied alongside status", (status) => {
  expect(memoryForExhibit(item, { status, records: [record] })).toEqual({ ...item, title: "활동 기록", photo: "" });
  expect(exhibitRecords({ status, records: [record] })).toEqual([]);
});

test("missing, cross-group and external records do not restore private snapshots", () => {
  for (const records of [[], [{ ...record, link: "/groups/8?activity=12" }], [{ ...record, link: "https://example.org/groups/7?activity=12" }]]) {
    expect(memoryForExhibit(item, { status: "ready", records }).photo).toBe("");
  }
  const local = { ...item, link: "" };
  expect(memoryForExhibit(local, { status: "denied", records: [] })).toBe(local);
  expect(exhibitRecords({ status: "ready", records: [record, record, record, record] })).toHaveLength(3);
});
