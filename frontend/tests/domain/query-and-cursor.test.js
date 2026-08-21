import { getSafeNextCursor, mergeCursorPages } from "../../src/entities/cursor/index.js";
import { buildGroupSearchParams } from "../../src/features/group/index.js";
import { buildRegistrationSearchParams } from "../../src/features/registration/index.js";

describe("query parameter builders", () => {
  it("omits blank and empty group filters", () => {
    // Given
    const filters = {
      status: "ACTIVE",
      relation: undefined,
      role: null,
      type: "",
      recruiting: false,
      keyword: "  ",
      cursor: "cursor-1",
      size: 20
    };

    // When
    const params = buildGroupSearchParams(filters);

    // Then
    expect(params).toEqual({ status: "ACTIVE", recruiting: false, cursor: "cursor-1", size: 20 });
  });

  it("always sends applicant=me for my registrations", () => {
    // Given
    const filters = { status: "PENDING", cursor: "", size: 10 };

    // When
    const params = buildRegistrationSearchParams(filters, true);

    // Then
    expect(params).toEqual({ applicant: "me", status: "PENDING", size: 10 });
  });
});

describe("cursor page merging", () => {
  it("deduplicates overlapping item identifiers", () => {
    // Given
    const pages = [
      { items: [{ id: 1 }, { id: 2 }], nextCursor: "next", hasNext: true },
      { items: [{ id: 2 }, { id: 3 }], nextCursor: null, hasNext: false }
    ];

    // When
    const result = mergeCursorPages(pages);

    // Then
    expect(result.items.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("returns a new next cursor when pagination can advance", () => {
    // Given
    const pages = [
      { items: [{ id: 1 }], nextCursor: "cursor-1", hasNext: true },
      { items: [{ id: 2 }], nextCursor: "cursor-2", hasNext: true }
    ];

    // When
    const result = getSafeNextCursor(pages[1], pages);

    // Then
    expect(result).toBe("cursor-2");
  });

  it("returns no next cursor when the backend repeats one", () => {
    // Given
    const pages = [
      { items: [{ id: 1 }], nextCursor: "same", hasNext: true },
      { items: [{ id: 2 }], nextCursor: "same", hasNext: true }
    ];

    // When
    const result = getSafeNextCursor(pages[1], pages);

    // Then
    expect(result).toBeUndefined();
  });

  it("stops pagination when a page repeats the previous cursor", () => {
    // Given
    const pages = [
      { items: [{ id: 1 }], nextCursor: "same", hasNext: true },
      { items: [{ id: 2 }], nextCursor: "same", hasNext: true }
    ];

    // When
    const result = mergeCursorPages(pages);

    // Then
    expect({ hasNext: result.hasNext, nextCursor: result.nextCursor }).toEqual({
      hasNext: false,
      nextCursor: null
    });
  });
});
