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

  it("drops HTML and unsafe link schemes", () => {
    const { container } = render(
      <MarkdownContent value={'<script>alert("x")</script>\n\n[위험](javascript:evil)'} />
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByText('<script>alert("x")</script>')).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "위험" })).not.toBeInTheDocument();
    expect(screen.getByText("위험")).toBeVisible();
  });

  it("accepts both emphasis spellings for bold and italic", () => {
    render(<MarkdownContent value="**별표 굵게** __밑줄 굵게__ *별표 기울임* _밑줄 기울임_" />);

    expect(screen.getByText("별표 굵게").tagName).toBe("STRONG");
    expect(screen.getByText("밑줄 굵게").tagName).toBe("STRONG");
    expect(screen.getByText("별표 기울임").tagName).toBe("EM");
    expect(screen.getByText("밑줄 기울임").tagName).toBe("EM");
  });

  it("leaves identifiers and arithmetic alone instead of reading them as emphasis", () => {
    const { container } = render(<MarkdownContent value={"user_name_value 그리고 2 * 3 * 4"} />);

    expect(container.querySelector("em")).toBeNull();
    expect(screen.getByText("user_name_value 그리고 2 * 3 * 4")).toBeVisible();
  });

  it("does not read a bold line as a bullet list", () => {
    const { container } = render(<MarkdownContent value="**굵게**로 시작하는 문단" />);

    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("p")).toBeVisible();
    expect(screen.getByText("굵게").tagName).toBe("STRONG");
  });

  it("renders thematic breaks and ordered lists", () => {
    const { container } = render(
      <MarkdownContent value={["첫 문단", "", "---", "", "1. 하나", "2. 둘"].join("\n")} />
    );

    expect(container.querySelector("hr")).toBeVisible();
    expect(container.querySelector("ol")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders GitHub Flavored Markdown extensions", () => {
    render(
      <MarkdownContent
        value={[
          "| 항목 | 상태 |",
          "| --- | --- |",
          "| 문서 | 완료 |",
          "",
          "- [x] 표와 체크박스",
          "- ~~예전 문법~~"
        ].join("\n")}
      />
    );

    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("예전 문법").tagName).toBe("DEL");
  });

  it("renders Markdown images", () => {
    render(<MarkdownContent value="![대표 이미지](https://example.com/group.png)" />);

    expect(screen.getByRole("img", { name: "대표 이미지" })).toHaveAttribute(
      "src",
      "https://example.com/group.png"
    );
  });

  it("renders safe disclosure HTML from GitHub READMEs", () => {
    const { container } = render(
      <MarkdownContent
        value={[
          "<details open>",
          "<summary>발표 자료 업로드 순서 보기</summary>",
          "",
          "업로드 순서입니다.",
          "</details>"
        ].join("\n")}
      />
    );

    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(container.querySelector("summary")).toHaveTextContent("발표 자료 업로드 순서 보기");
    expect(screen.getByText("업로드 순서입니다.")).toBeVisible();
  });

  it("keeps fenced code literal instead of parsing it as Markdown", () => {
    const { container } = render(
      <MarkdownContent
        value={["```", "const total = a_b_c * 2;", "// **강조 아님**", "```"].join("\n")}
      />
    );

    const block = container.querySelector("pre code");
    expect(block).toBeVisible();
    expect(block).toHaveTextContent("const total = a_b_c * 2;");
    expect(block).toHaveTextContent("// **강조 아님**");
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("em")).toBeNull();
  });

  it("renders an unclosed fence rather than dropping the half-typed block", () => {
    const { container } = render(<MarkdownContent value={"본문\n\n```\nnpm run dev"} />);

    expect(container.querySelector("pre code")).toHaveTextContent("npm run dev");
  });

  it("keeps inline code spans literal", () => {
    const { container } = render(<MarkdownContent value={"`a_b_c` 와 `x * y` 는 그대로"} />);

    expect(container.querySelectorAll("code")).toHaveLength(2);
    expect(container.querySelector("em")).toBeNull();
    expect(screen.getByText("a_b_c")).toBeVisible();
  });
});
