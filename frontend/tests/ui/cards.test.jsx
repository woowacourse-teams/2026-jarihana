import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Avatar, GroupCard } from "../../src/shared/ui/index.js";

const mockNavigate = jest.fn();

function ClientLink({ children, to, ...properties }) {
  return (
    <a
      {...properties}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        mockNavigate(to);
      }}
    >
      {children}
    </a>
  );
}

describe("GroupCard", () => {
  it("Given a React Router compatible link, When the card is activated, Then it delegates client navigation without a document reload", async () => {
    const user = userEvent.setup();
    render(
      <GroupCard
        as={ClientLink}
        group={{
          id: 17,
          introduction: "함께 공부해요.",
          name: "프론트엔드 스터디",
          recruiting: true,
          type: "STUDY"
        }}
      />
    );

    await user.click(screen.getByRole("link", { name: /프론트엔드 스터디/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/groups/17");
  });

  it("Given the mobile activity appearance, When the card renders, Then it keeps the image and desktop schedule metadata in one link", () => {
    render(
      <GroupCard
        group={{
          activeRecruitment: { approvedCount: 6, capacity: 10, id: 90 },
          id: 18,
          introduction: "함께 공부해요.",
          memberCount: 6,
          name: "리액트 스터디",
          recruiting: true,
          recurringSchedule: { daysOfWeek: ["MONDAY", "WEDNESDAY"] },
          representativeImageUrl: "/images/react-study.png",
          type: "STUDY"
        }}
        mobileAppearance="activity"
        showScheduleMeta
      />
    );

    const card = screen.getByRole("link", { name: /리액트 스터디/ });
    expect(card).toHaveClass("ui-group-card--mobile-activity");
    expect(card.querySelector(".ui-group-card__image")).toHaveAttribute(
      "src",
      "/api/images/react-study.png"
    );
    expect(card.querySelector(".ui-group-card__detail-meta")).toHaveTextContent(
      "주 2회 · 4자리 남음"
    );
    expect(card.querySelector(".ui-group-card__activity-members")).not.toBeInTheDocument();
  });

  it.each([
    ["without an active recruitment", null],
    [
      "with a full active recruitment",
      { approvedCount: 8, capacity: 8, id: 91 }
    ]
  ])(
    "Given a group %s, When the discovery card renders, Then it omits recruitment closure copy",
    (_state, activeRecruitment) => {
      render(
        <GroupCard
          group={{
            activeRecruitment,
            id: 19,
            introduction: "함께 공부해요.",
            name: "마감된 스터디",
            recruiting: false,
            recurringSchedule: { daysOfWeek: ["MONDAY"] },
            type: "STUDY"
          }}
          showScheduleMeta
        />
      );

      const card = screen.getByRole("link", { name: /마감된 스터디/ });
      expect(card).toHaveTextContent("주 1회");
      expect(card).not.toHaveTextContent("모집 마감");
      expect(card.querySelector(".ui-group-card__recruitment")).not.toBeInTheDocument();
    }
  );
});

describe("Avatar", () => {
  it("Given a GitHub avatar URL, When the image fails to load, Then it falls back to the member initial", () => {
    render(
      <Avatar
        alt="이삭 프로필"
        fallback="이"
        src="https://avatars.githubusercontent.com/u/123?v=4"
      />
    );

    const image = screen.getByRole("img", { name: "이삭 프로필" });
    expect(image).toHaveAttribute("src", "https://avatars.githubusercontent.com/u/123?v=4");

    fireEvent.error(image);

    expect(screen.queryByRole("img", { name: "이삭 프로필" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("이삭 프로필")).toHaveTextContent("이");
  });
});
