import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupCard } from "../../src/shared/ui/index.js";

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
