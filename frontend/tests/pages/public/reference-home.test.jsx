import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";

import * as authHooks from "../../../src/features/auth/index.js";
import * as groupHooks from "../../../src/features/group/index.js";
import { GroupsPage } from "../../../src/pages/groups/GroupsPage.jsx";
import { sessionHeadline } from "../../../src/pages/groups/home/useSessionHeadline.js";
import { GroupBrowsePage } from "../../../src/pages/groups/GroupBrowsePage.jsx";
import { RecruitingSection } from "../../../src/pages/groups/home/RecruitingSection.jsx";

jest.mock("../../../src/features/auth/index.js", () => ({
  storeReturnTarget: jest.fn(),
  useAuth: jest.fn()
}));

jest.mock("../../../src/features/group/useTodaySessions.js", () => ({
  useTodaySessions: () => ({ date: "2026-09-27", data: [], isLoading: false, refetch: jest.fn() })
}));

jest.mock("../../../src/features/group/index.js", () => ({
  useInfiniteGroups: jest.fn()
}));

jest.mock("react-router", () => {
  const React = require("react");
  const RouterContext = React.createContext(null);

  function toLocation(entry) {
    const url = new URL(entry, "https://jarihana.test");
    return { pathname: url.pathname, search: url.search, state: null };
  }

  function MemoryRouter({ children, initialEntries = ["/"] }) {
    const [location, setLocation] = React.useState(() => toLocation(initialEntries[0]));
    const value = React.useMemo(() => ({ location, setLocation }), [location]);

    return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
  }

  function useLocation() {
    return React.useContext(RouterContext).location;
  }

  function useNavigate() {
    const router = React.useContext(RouterContext);

    return (to) => {
      router.setLocation((current) => ({ ...current, ...toLocation(to) }));
    };
  }

  function useSearchParams() {
    const router = React.useContext(RouterContext);
    const params = React.useMemo(
      () => new URLSearchParams(router.location.search),
      [router.location.search]
    );

    function setSearchParams(next) {
      const nextParams = new URLSearchParams(typeof next === "function" ? next(params) : next);
      const search = nextParams.toString();
      router.setLocation((current) => ({ ...current, search: search ? `?${search}` : "" }));
    }

    return [params, setSearchParams];
  }

  function Link({ children, to, ...props }) {
    return (
      <a href={typeof to === "string" ? to : "/"} {...props}>
        {children}
      </a>
    );
  }

  return { Link, MemoryRouter, useLocation, useNavigate, useSearchParams };
});

function makeGroup(overrides = {}) {
  const id = overrides.id ?? 1;
  const type = overrides.type ?? "STUDY";

  return {
    id,
    type,
    meetingType: "FLEXIBLE",
    location: "잠실 캠퍼스",
    status: "ACTIVE",
    name: `우테코 모임 ${id}`,
    introduction: "함께 배우고 기록하는 모임입니다.",
    representativeImageUrl: "/images/default-group.png",
    leader: { memberId: id, crewName: `크루${id}`, generation: 12 },
    memberCount: 4,
    currentMemberRole: null,
    recurringSchedule:
      type === "SESSION"
        ? null
        : {
            daysOfWeek: ["MONDAY"],
            startTime: "19:00:00",
            endTime: "21:00:00"
          },
    sessionSchedule:
      type === "SESSION"
        ? {
            sessionDate: "2026-10-05",
            startTime: "19:00:00",
            endTime: "20:30:00"
          }
        : null,
    activeRecruitment: {
      id: id * 10,
      joinMethod: "APPROVAL",
      capacity: 6,
      approvedCount: 3,
      startsAt: "2026-09-20T09:00:00",
      endsAt: "2026-10-01T23:59:59"
    },
    createdAt: "2026-09-01T09:00:00",
    ...overrides
  };
}

function infiniteGroups({
  groups = [],
  error = null,
  fetchNextPage = jest.fn(),
  hasNextPage = false,
  isError = false,
  isLoading = false
} = {}) {
  return {
    data: {
      pages: [
        { items: groups, nextCursor: hasNextPage ? "next-cursor" : null, hasNext: hasNextPage }
      ]
    },
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading,
    refetch: jest.fn()
  };
}

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="현재 검색 조건">{location.search}</output>;
}

function renderRecruitingSection(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RecruitingSection />
      <LocationProbe />
    </MemoryRouter>
  );
}

function lastGroupQuery() {
  return groupHooks.useInfiniteGroups.mock.calls.at(-1)[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  authHooks.useAuth.mockReturnValue({ status: "anonymous", login: jest.fn() });
  groupHooks.useInfiniteGroups.mockReturnValue(infiniteGroups());
});

it("Given home query params, when recruiting groups render, then the active recruiting query and featured cards are used", () => {
  const groups = Array.from({ length: 5 }, (_, index) =>
    makeGroup({ id: index + 1, name: `모집 모임 ${index + 1}` })
  );
  groupHooks.useInfiniteGroups.mockReturnValue(infiniteGroups({ groups, hasNextPage: true }));

  renderRecruitingSection("/?homeKeyword=react&homeType=STUDY&kept=1");

  expect(groupHooks.useInfiniteGroups).toHaveBeenCalledWith({
    status: "ACTIVE",
    recruiting: true,
    type: "STUDY",
    keyword: "react",
    size: 4
  });
  expect(screen.getByRole("heading", { name: "지금 모집 중인 모임" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /모집 모임 1/ })).toHaveAttribute("href", "/groups/1");
  expect(screen.queryByRole("link", { name: /모집 모임 5/ })).not.toBeInTheDocument();

  const featuredCard = document.querySelector(".reference-group-card--featured");
  expect(featuredCard).not.toBeNull();
  expect(within(featuredCard).getByText("모집 모임 1")).toBeInTheDocument();
  const cards = within(document.querySelector(".reference-recruiting-grid")).getAllByRole("link");
  expect(cards).toHaveLength(4);
  cards.forEach((link) => {
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "group_view");
  });
});

it("Given filtered recruiting results, when the preview renders, then a heading link opens the separate list with those filters", () => {
  const fetchNextPage = jest.fn();
  const groups = Array.from({ length: 5 }, (_, index) =>
    makeGroup({ id: index + 1, name: `모집 모임 ${index + 1}` })
  );
  groupHooks.useInfiniteGroups.mockReturnValue(
    infiniteGroups({ fetchNextPage, groups, hasNextPage: true })
  );

  renderRecruitingSection("/?homeType=STUDY&homeKeyword=react&kept=1");

  const link = screen.getByRole("link", { name: "모집 중인 모임 더 보기" });
  expect(link).toHaveAttribute(
    "href",
    "/groups?status=ACTIVE&recruiting=true&type=STUDY&keyword=react"
  );
  expect(link).toHaveAttribute("data-ph-capture-attribute-action", "home_discovery_browse");
  expect(link.closest(".reference-section-heading")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "더 많은 모임 보기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /모집 모임 5/ })).not.toBeInTheDocument();
  expect(fetchNextPage).not.toHaveBeenCalled();
});

it("Given a preview, when a type pill changes the filter, then the query and browse destination change", async () => {
  const user = userEvent.setup();
  const groups = Array.from({ length: 5 }, (_, index) =>
    makeGroup({ id: index + 1, name: `모집 모임 ${index + 1}` })
  );
  groupHooks.useInfiniteGroups.mockReturnValue(infiniteGroups({ groups }));

  renderRecruitingSection("/?homeKeyword=react");

  await user.click(screen.getByRole("button", { name: "같이해요" }));

  await waitFor(() =>
    expect(lastGroupQuery()).toEqual({
      status: "ACTIVE",
      recruiting: true,
      type: "SESSION",
      keyword: "react",
      size: 4
    })
  );
  expect(screen.getByRole("link", { name: "모집 중인 모임 더 보기" })).toHaveAttribute(
    "href",
    "/groups?status=ACTIVE&recruiting=true&type=SESSION&keyword=react"
  );
  expect(screen.getByRole("button", { name: "같이해요" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("link", { name: /모집 모임 5/ })).not.toBeInTheDocument();
});

it("Given a draft search, when Enter submits it, then homeKeyword changes while unrelated URL params stay intact", async () => {
  const user = userEvent.setup();
  groupHooks.useInfiniteGroups.mockReturnValue(
    infiniteGroups({ groups: [makeGroup({ id: 11, name: "검색 전 모임" })] })
  );

  renderRecruitingSection("/?homeType=CLUB&kept=1");

  await user.type(screen.getByRole("searchbox", { name: "모임 검색" }), "리액트{Enter}");

  await waitFor(() =>
    expect(lastGroupQuery()).toEqual({
      status: "ACTIVE",
      recruiting: true,
      type: "CLUB",
      keyword: "리액트",
      size: 4
    })
  );
  expect(screen.getByLabelText("현재 검색 조건")).toHaveTextContent("homeType=CLUB");
  expect(screen.getByLabelText("현재 검색 조건")).toHaveTextContent("kept=1");
  expect(screen.getByLabelText("현재 검색 조건")).toHaveTextContent(
    `homeKeyword=${encodeURIComponent("리액트")}`
  );
});

it.each([
  ["/?homeType=HACK", { status: "ACTIVE", recruiting: true, size: 4 }],
  ["/?homeType=SESSION", { status: "ACTIVE", recruiting: true, type: "SESSION", size: 4 }],
  ["/?homeType=STUDY", { status: "ACTIVE", recruiting: true, type: "STUDY", size: 4 }],
  ["/?homeType=CLUB", { status: "ACTIVE", recruiting: true, type: "CLUB", size: 4 }]
])(
  "Given %s, when the section renders, then only valid homeType values reach the query",
  (entry, expected) => {
    renderRecruitingSection(entry);

    expect(lastGroupQuery()).toEqual(expected);
  }
);

it("Given there are no recruiting groups, when the section renders, then the empty state explains the result", () => {
  groupHooks.useInfiniteGroups.mockReturnValue(infiniteGroups({ groups: [] }));

  renderRecruitingSection();

  expect(screen.getByText("모집 중인 모임이 아직 없어요")).toBeInTheDocument();
  expect(document.querySelector(".reference-group-card")).toBeNull();
  expect(screen.getByRole("link", { name: "모집 중인 모임 더 보기" })).toBeInTheDocument();
});

it("Given the recruiting query fails, when the section renders, then the retryable error state is shown", async () => {
  const user = userEvent.setup();
  const refetch = jest.fn();
  groupHooks.useInfiniteGroups.mockReturnValue({
    ...infiniteGroups({ error: new Error("network"), isError: true }),
    refetch
  });

  renderRecruitingSection();

  expect(
    screen.getByRole("heading", { name: "모집 중인 모임을 불러오지 못했어요" })
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

function renderBrowsePage(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <GroupBrowsePage />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("separate group browsing", () => {
  beforeEach(() => {
    jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("continues the homepage search and type in a paginated list", () => {
    const groups = Array.from({ length: 5 }, (_, index) => makeGroup({ id: index + 1 }));
    groupHooks.useInfiniteGroups.mockReturnValue(infiniteGroups({ groups, hasNextPage: true }));
    renderBrowsePage("/groups?status=ACTIVE&recruiting=true&type=STUDY&keyword=react");
    expect(lastGroupQuery()).toEqual({
      status: "ACTIVE",
      recruiting: true,
      type: "STUDY",
      keyword: "react",
      size: 12
    });
    expect(screen.getByRole("heading", { level: 1, name: "자리 둘러보기" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("react");
    expect(screen.getByRole("combobox", { name: "모임 유형" })).toHaveValue("STUDY");
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "더 많은 모임 보기" })).toBeInTheDocument();
  });

  it("shows original discovery information for each group type", () => {
    // Given
    groupHooks.useInfiniteGroups.mockReturnValue(
      infiniteGroups({
        groups: [
          makeGroup(),
          makeGroup({ id: 2, type: "SESSION" }),
          makeGroup({ id: 3, type: "CLUB" })
        ]
      })
    );

    // When
    renderBrowsePage("/groups");

    // Then
    for (const id of [1, 2, 3]) {
      const card = screen.getByRole("link", { name: new RegExp(`우테코 모임 ${id}`) });
      expect(card).toHaveAttribute("href", `/groups/${id}`);
      expect(card).toHaveAttribute("data-ph-capture-attribute-action", "group_view");
      expect(within(card).getByText("함께 배우고 기록하는 모임입니다.")).toBeInTheDocument();
      expect(within(card).getByText("잠실 캠퍼스")).toBeInTheDocument();
      expect(within(card).getByText("3자리 남음")).toBeInTheDocument();
      expect(within(card).getByText("모집 중")).toBeInTheDocument();
    }
    const session = screen.getByRole("link", { name: /우테코 모임 2/ });
    expect(within(session).getByText("10/5 · 19:00 – 20:30")).toBeInTheDocument();
    expect(within(session).getByText("90분")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /우테코 모임 1/ })).getByText(
        "매주 월 · 19:00 – 21:00"
      )
    ).toBeInTheDocument();
  });

  it("loads the next cursor only from the browse page", async () => {
    const user = userEvent.setup();
    const fetchNextPage = jest.fn();
    groupHooks.useInfiniteGroups.mockReturnValue(
      infiniteGroups({ groups: [makeGroup()], hasNextPage: true, fetchNextPage })
    );
    renderBrowsePage("/groups");
    await user.click(screen.getByRole("button", { name: "더 많은 모임 보기" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("keeps the keyword and type when switching to ended groups and clears recruiting", async () => {
    const user = userEvent.setup();
    renderBrowsePage("/groups?status=ACTIVE&recruiting=true&type=STUDY&keyword=react");
    await user.selectOptions(screen.getByRole("combobox", { name: "모임 상태" }), "ENDED");
    expect(lastGroupQuery()).toEqual({
      status: "ENDED",
      recruiting: undefined,
      type: "STUDY",
      keyword: "react",
      size: 12
    });
    expect(screen.getByRole("combobox", { name: "모집 상태" })).toHaveValue("");
  });
});

describe("headline in the introduction hero", () => {
  const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    authHooks.useAuth.mockReturnValue({ status: "authenticated" });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
    else delete navigator.geolocation;
  });

  it.each(["anonymous", "loading", "signup-required", "unavailable"])(
    "keeps the service title first while auth is %s",
    (status) => {
      jest.setSystemTime(new Date("2026-09-27T14:00:00+09:00"));
      authHooks.useAuth.mockReturnValue({ status });

      render(
        <MemoryRouter>
          <GroupsPage />
        </MemoryRouter>
      );

      expect(
        screen.getByRole("heading", { level: 1, name: "크루와 함께할 자리를 찾아보세요" })
      ).toBeInTheDocument();
      expect(document.querySelector(".reference-hero__subtitle")).toHaveTextContent(
        sessionHeadline(new Date(), 0)
      );
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    }
  );

  it("swaps the two messages on login and logout without resetting the phrase or search filters", () => {
    jest.setSystemTime(new Date("2026-09-27T14:00:00+09:00"));
    authHooks.useAuth.mockReturnValue({ status: "anonymous" });
    const page = () => (
      <MemoryRouter initialEntries={["/?homeType=STUDY&homeKeyword=java"]}>
        <GroupsPage />
      </MemoryRouter>
    );
    const { rerender } = render(page());
    const headline = sessionHeadline(new Date(), 0);
    fireEvent.change(screen.getByRole("searchbox", { name: "모임 검색" }), {
      target: { value: "react" }
    });

    authHooks.useAuth.mockReturnValue({ status: "authenticated" });
    rerender(page());

    expect(screen.getByRole("heading", { level: 1, name: headline })).toBeInTheDocument();
    expect(document.querySelector(".reference-hero__subtitle")).toHaveTextContent(
      "크루와 함께할 자리를 찾아보세요"
    );
    expect(screen.getByRole("searchbox", { name: "모임 검색" })).toHaveValue("react");
    expect(screen.getByRole("button", { name: "스터디", pressed: true })).toBeInTheDocument();

    authHooks.useAuth.mockReturnValue({ status: "anonymous" });
    rerender(page());

    expect(
      screen.getByRole("heading", { level: 1, name: "크루와 함께할 자리를 찾아보세요" })
    ).toBeInTheDocument();
    expect(document.querySelector(".reference-hero__subtitle")).toHaveTextContent(headline);
    expect(screen.getByRole("searchbox", { name: "모임 검색" })).toHaveValue("react");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("updates the introduction headline at the next time slot without duplicating it below", () => {
    // Given
    jest.setSystemTime(new Date("2026-09-27T12:59:50+09:00"));
    render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>
    );
    const introduction = screen.getByRole("heading", { level: 1 }).closest("section");
    const today = screen.getByRole("region", { name: "오늘 같이해요" });

    // When
    act(() => jest.advanceTimersByTime(60_000));

    // Then
    const headline = sessionHeadline(new Date(), 0);
    expect(
      within(introduction).getByRole("heading", { level: 1, name: headline })
    ).toHaveTextContent(headline);
    expect(today).not.toHaveTextContent(headline);
    expect(
      within(today).getByRole("button", { name: "내 위치로 캠퍼스 확인" })
    ).toBeInTheDocument();
  });

  it.each([
    ["anonymous", "05:59:59.900", "night", "day"],
    ["authenticated", "05:59:59.900", "night", "day"],
    ["anonymous", "16:59:59.900", "day", "sunset"],
    ["authenticated", "16:59:59.900", "day", "sunset"],
    ["anonymous", "19:59:59.900", "sunset", "night"],
    ["authenticated", "19:59:59.900", "sunset", "night"]
  ])("updates the %s hero at %s without changing search or auth layout", (status, time, before, after) => {
    jest.setSystemTime(new Date(`2026-09-27T${time}+09:00`));
    authHooks.useAuth.mockReturnValue({ status });
    render(
      <MemoryRouter initialEntries={["/?homeType=STUDY&homeKeyword=java"]}>
        <GroupsPage />
      </MemoryRouter>
    );
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    fireEvent.change(screen.getByRole("searchbox", { name: "모임 검색" }), {
      target: { value: "react" }
    });
    expect(hero).toHaveAttribute("data-time-of-day", before);
    act(() => jest.advanceTimersByTime(99));
    expect(hero).toHaveAttribute("data-time-of-day", before);
    act(() => jest.advanceTimersByTime(1));
    expect(hero).toHaveAttribute("data-time-of-day", after);
    const headline = sessionHeadline(new Date(), 0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      status === "authenticated" ? headline : "크루와 함께할 자리를 찾아보세요"
    );
    expect(hero.querySelector(".reference-hero__subtitle")).toHaveTextContent(
      status === "authenticated" ? "크루와 함께할 자리를 찾아보세요" : headline
    );
    expect(screen.getByRole("searchbox", { name: "모임 검색" })).toHaveValue("react");
    expect(screen.getByRole("button", { name: "스터디", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each(["focus", "visibilitychange"])("updates the rendered hero on tab return via %s", (event) => {
    jest.setSystemTime(new Date("2026-09-27T16:00:00+09:00"));
    render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>
    );
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(hero).toHaveAttribute("data-time-of-day", "day");
    jest.setSystemTime(new Date("2026-09-27T20:00:00+09:00"));
    act(() => (event === "focus" ? window : document).dispatchEvent(new Event(event)));
    expect(hero).toHaveAttribute("data-time-of-day", "night");
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(sessionHeadline(new Date(), 0));
  });

  it("updates the introduction headline when the today section checks the campus location", () => {
    // Given
    jest.setSystemTime(new Date("2026-09-27T19:00:00+09:00"));
    const getCurrentPosition = jest.fn((success) =>
      success({ coords: { latitude: 37.406397, longitude: 127.088898, accuracy: 10 } })
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition }
    });
    render(
      <MemoryRouter>
        <GroupsPage />
      </MemoryRouter>
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();

    // When
    fireEvent.click(screen.getByRole("button", { name: "내 위치로 캠퍼스 확인" }));

    // Then
    const introduction = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(
      within(introduction).getByRole("heading", {
        level: 1,
        name: sessionHeadline(new Date(), 0, true)
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("판교 캠퍼스 근처예요.");
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
