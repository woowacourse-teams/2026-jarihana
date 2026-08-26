import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(
  join(process.cwd(), "src/pages/group-editor/styles.css"),
  "utf8"
);

/*
 * 한 선택자에 걸리는 선언을 모두 모은다. 같은 선택자가 여러 규칙에 나뉘어
 * 나오므로(:hover와 묶인 규칙 등) 첫 규칙만 보면 실제 적용 결과를 놓친다.
 */
function declarationsFor(selector) {
  const bodies = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(css)) !== null) {
    const selectors = match[1].split(",").map((part) => part.trim().replace(/\s+/g, " "));
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies.join("\n");
}

/* 선언 위치와 무관하게, 어떤 선택자들이 그 변수를 선언하는지 모은다. */
function declaringSelectors(variable) {
  const found = [];
  const pattern = new RegExp(`([^{}]+)\\{[^{}]*${variable}\\s*:`, "g");
  let match;
  while ((match = pattern.exec(css)) !== null) {
    found.push(match[1].trim().split("\n").at(-1).trim());
  }
  return found;
}

describe("활동 일정 모달 스타일", () => {
  /*
   * Modal은 createPortal로 .group-editor 바깥에 렌더된다. 요일 칩이 쓰는 커스텀
   * 속성을 .group-editor에만 선언하면 모달까지 닿지 않아, 원 크기와 주말 배경이
   * 통째로 무효가 된다(흰 글자만 남아 보이지 않는다).
   */
  it.each(["--group-editor-day-size", "--group-editor-weekend"])(
    "%s 를 포탈된 모달이 상속할 수 있는 곳에 선언한다",
    (variable) => {
      const selectors = declaringSelectors(variable);

      expect(selectors.length).toBeGreaterThan(0);
      expect(
        selectors.some(
          (selector) =>
            selector.includes(".group-editor__schedule-dialog") || selector.trim() === ":root"
        )
      ).toBe(true);
      expect(selectors).not.toEqual([".group-editor"]);
    }
  );

  it("요일 칩은 글자 크기가 아니라 지정된 지름으로 그려진다", () => {
    const body = declarationsFor(".group-editor__day-chip > span");

    expect(body).toContain("inline-size: var(--group-editor-day-size)");
    expect(body).toContain("block-size: var(--group-editor-day-size)");
    expect(body).toContain("place-items: center");
  });

  it("주말 칩은 선택 시 채움과 글자색을 함께 지정한다", () => {
    const body = declarationsFor(".group-editor__day-chip.is-weekend input:checked + span");

    // 배경만 빠지면 흰 글자가 흰 모달 위에 남아 보이지 않는다.
    expect(body).toContain("background: var(--group-editor-weekend)");
    expect(body).toContain("color: var(--color-surface)");
  });
});
