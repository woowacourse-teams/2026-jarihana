import { act, renderHook } from "@testing-library/react";

let mockSearchParams;
let mockSetSearchParams;
jest.mock("react-router", () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams]
}));

const { useDiscoveryFilters } = require("../../src/pages/groups/home/useDiscoveryFilters.js");

function setup(path = "/groups") {
  mockSearchParams = new URLSearchParams(path.split("?")[1]);
  const hook = renderHook(() => ({
    session: useDiscoveryFilters("session"),
    community: useDiscoveryFilters("community"),
    location: { search: mockSearchParams.toString() },
    navigate: (url) => {
      mockSearchParams = new URLSearchParams(url.split("?")[1]);
      hook.rerender();
    }
  }));
  mockSetSearchParams = (params) => {
    mockSearchParams = params;
    hook.rerender();
  };
  hook.rerender();
  return hook;
}

it("starts with separate session and community queries", () => {
  const { result } = setup();
  expect(result.current.session.queryFilters).toEqual(
    expect.objectContaining({ type: "SESSION", status: "ACTIVE" })
  );
  expect(result.current.community.queryFilters).toEqual(
    expect.objectContaining({ excludedType: "SESSION", status: "ACTIVE" })
  );
  expect(result.current.community.queryFilters.type).toBeUndefined();
});

it("searches and resets only the selected section while preserving the other section", () => {
  const { result } = setup("/groups?keyword=자바&type=STUDY&recruiting=true&sessionStatus=ENDED");
  act(() => result.current.session.setSearchValue("  산책  "));
  act(() => result.current.session.submitSearch({ preventDefault() {} }));
  expect(result.current.session.queryFilters.keyword).toBe("산책");
  expect(result.current.community.queryFilters).toEqual(
    expect.objectContaining({ keyword: "자바", type: "STUDY", recruiting: true })
  );
  act(() => result.current.session.resetFilters());
  expect(result.current.session.queryFilters).toEqual(
    expect.objectContaining({ keyword: undefined, status: "ACTIVE" })
  );
  expect(result.current.community.queryFilters.keyword).toBe("자바");
});

it.each(["session", "community"])(
  "preserves all legacy session conditions when %s filters first change",
  (kind) => {
    const { result } = setup("/groups?type=SESSION&keyword=산책&status=ENDED&recruiting=false");
    expect(result.current.session.queryFilters).toEqual(
      expect.objectContaining({ keyword: "산책", status: "ENDED", recruiting: false })
    );
    expect(result.current.community.queryFilters.keyword).toBeUndefined();
    act(() =>
      result.current[kind].updateQuery(
        kind === "session" ? { sessionStatus: "ACTIVE" } : { type: "CLUB" }
      )
    );
    expect(result.current.session.queryFilters).toEqual(
      expect.objectContaining({
        keyword: "산책",
        status: kind === "session" ? "ACTIVE" : "ENDED",
        recruiting: false
      })
    );
    expect(result.current.community.queryFilters.keyword).toBeUndefined();
    expect(new URLSearchParams(result.current.location.search).get("sessionKeyword")).toBe("산책");
  }
);

it("uses explicit empty session keyword over a legacy fallback", () => {
  const { result } = setup("/groups?type=SESSION&keyword=산책&sessionKeyword=");
  expect(result.current.session.queryFilters.keyword).toBeUndefined();
});

it("restores URL values after navigation without submitting an old search draft", () => {
  const { result } = setup("/groups?sessionKeyword=산책&keyword=자바");
  act(() => result.current.session.setSearchValue("미완성 검색"));
  act(() => result.current.navigate("/groups?sessionKeyword=독서&keyword=리액트"));
  expect(result.current.session.controls.searchValue).toBe("독서");
  expect(result.current.community.controls.searchValue).toBe("리액트");
  act(() => result.current.session.submitSearch({ preventDefault() {} }));
  expect(result.current.session.queryFilters.keyword).toBe("독서");
});
