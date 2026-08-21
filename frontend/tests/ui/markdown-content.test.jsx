import { render, screen } from "@testing-library/react";

import { MarkdownContent } from "../../src/shared/ui/index.js";

describe("MarkdownContent", () => {
  it("renders the supported Markdown blocks and inline styles as semantic React elements", () => {
    render(
      <MarkdownContent
        value={[
          "## 함께 공부해요",
          "",
          "**중요한 약속**",
          "",
          "- 매주 한 번",
          "- 서로 리뷰",
          "",
          "> 질문을 환영해요",
          "",
          "[자리하나 보기](/groups)"
        ].join("\n")}
      />
    );

    expect(screen.getByRole("heading", { name: "함께 공부해요" })).toBeVisible();
    expect(screen.getByText("중요한 약속").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("질문을 환영해요").closest("blockquote")).toBeVisible();
    expect(screen.getByRole("link", { name: "자리하나 보기" })).toHaveAttribute("href", "/groups");
  });

  it("keeps HTML and unsafe link schemes inert", () => {
    const { container } = render(
      <MarkdownContent value={'<script>alert("x")</script>\n\n[위험](javascript:evil)'} />
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText('<script>alert("x")</script>')).toBeVisible();
    expect(screen.queryByRole("link", { name: "위험" })).not.toBeInTheDocument();
    expect(screen.getByText("위험")).toBeVisible();
  });
});
