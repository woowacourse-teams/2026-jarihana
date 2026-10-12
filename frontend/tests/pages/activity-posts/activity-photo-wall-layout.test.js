import { calculateActivityPhotoWallLayout } from "../../../src/pages/activity-posts/activity-photo-wall-layout.js";

it("places each chronological card in the shortest column and breaks ties to the left", () => {
  const layout = calculateActivityPhotoWallLayout({
    cardHeights: [300, 120, 120, 80, 90],
    columnCount: 3,
    columnGap: 20,
    rowGap: 16,
    wallWidth: 1000
  });

  expect(layout.positions).toEqual([
    { left: 0, top: 0, width: 320 },
    { left: 340, top: 0, width: 320 },
    { left: 680, top: 0, width: 320 },
    { left: 340, top: 136, width: 320 },
    { left: 680, top: 136, width: 320 }
  ]);
  expect(layout.columnAssignments).toEqual([0, 1, 2, 1, 2]);
  expect(layout.height).toBe(300);
});

it("keeps existing cards in their columns and assigns an appended card to the shortest stack", () => {
  const layout = calculateActivityPhotoWallLayout({
    cardHeights: [300, 120, 120, 80],
    columnCount: 3,
    columnGap: 20,
    preferredColumnIndexes: [0, 1, 2],
    rowGap: 16,
    wallWidth: 1000
  });

  expect(layout.columnAssignments).toEqual([0, 1, 2, 1]);
  expect(layout.positions[3]).toEqual({ left: 340, top: 136, width: 320 });
});

it("re-packs only the suffix after an earlier card's image height changes", () => {
  const layout = calculateActivityPhotoWallLayout({
    cardHeights: [300, 100, 100, 100],
    columnCount: 3,
    columnGap: 20,
    preferredColumnIndexes: [0, undefined, undefined, undefined],
    rowGap: 16,
    wallWidth: 1000
  });

  expect(layout.columnAssignments).toEqual([0, 1, 2, 1]);
  expect(layout.positions[3]).toEqual({ left: 340, top: 116, width: 320 });
});

it("keeps a single stack and handles an empty board", () => {
  const layout = calculateActivityPhotoWallLayout({
    cardHeights: [180, 220],
    columnCount: 1,
    columnGap: 24,
    rowGap: 12,
    wallWidth: 360
  });
  const emptyLayout = calculateActivityPhotoWallLayout({
    cardHeights: [],
    columnCount: 0,
    columnGap: 24,
    rowGap: 12,
    wallWidth: 360
  });

  expect(layout.positions.map(({ top }) => top)).toEqual([0, 192]);
  expect(layout.height).toBe(412);
  expect(emptyLayout).toEqual({ height: 0, columnAssignments: [], positions: [] });
});
