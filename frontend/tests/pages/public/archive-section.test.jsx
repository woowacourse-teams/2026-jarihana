import { render, screen } from "@testing-library/react";

import { useInfiniteGroups } from "../../../src/features/group/index.js";
import { ArchiveSection } from "../../../src/pages/groups/home/ArchiveSection.jsx";

jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={typeof to === "string" ? to : "/"} {...props}>
      {children}
    </a>
  )
}));

jest.mock("../../../src/features/group/index.js", () => ({
  useInfiniteGroups: jest.fn()
}));

function archiveGroup(id) {
  return {
    id,
    type: id % 2 === 0 ? "STUDY" : "CLUB",
    status: "ENDED",
    name: `종료 모임 ${id}`,
    introduction: "지난 활동입니다.",
    representativeImageUrl: "/images/default-group.png",
    memberCount: id + 3,
    recurringSchedule: {
      daysOfWeek: ["MONDAY"],
      startTime: "19:00:00",
      endTime: "21:00:00"
    },
    sessionSchedule: null,
    activeRecruitment: null
  };
}

function archiveQuery(overrides = {}) {
  return {
    data: {
      pages: [
        {
          items: Array.from({ length: 6 }, (_, index) => archiveGroup(index + 1)),
          nextCursor: null,
          hasNext: false
        }
      ]
    },
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn(),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("Given ended groups, when the archive renders, then it requests only ended groups and shows four cards first", () => {
  useInfiniteGroups.mockReturnValue(archiveQuery());

  render(<ArchiveSection />);

  expect(useInfiniteGroups).toHaveBeenCalledWith({ size: 4, status: "ENDED" });
  expect(screen.getByRole("heading", { name: "지난 모임 아카이브" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /종료 모임/ })).toHaveLength(4);
  expect(screen.getByText("종료 모임 4")).toBeInTheDocument();
  expect(screen.queryByText("종료 모임 5")).not.toBeInTheDocument();
});

it.each([false, true])(
  "Given hasNextPage=%s, when the archive renders, then all ended groups are available through browse navigation",
  (hasNextPage) => {
    const fetchNextPage = jest.fn();
    useInfiniteGroups.mockReturnValue(
      archiveQuery({
        data: {
          pages: [{ items: Array.from({ length: 4 }, (_, index) => archiveGroup(index + 1)) }]
        },
        fetchNextPage,
        hasNextPage
      })
    );

    render(<ArchiveSection />);

    const link = screen.getByRole("link", { name: "지난 모임 전체 보기" });
    expect(link).toHaveAttribute("href", "/groups?status=ENDED");
    expect(link).toHaveAttribute("data-ph-capture-attribute-action", "archive_browse");
    expect(screen.queryByRole("button", { name: "전체 보기" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /종료 모임/ })).toHaveLength(4);
    expect(fetchNextPage).not.toHaveBeenCalled();
  }
);
