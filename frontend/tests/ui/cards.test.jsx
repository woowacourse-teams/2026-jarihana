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
