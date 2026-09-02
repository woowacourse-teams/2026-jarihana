import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCode
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarkdownContent, Textarea } from "../../shared/ui/index.js";

const WRAPPERS = {
  bold: { after: "**", before: "**", placeholder: "강조할 내용" },
  code: { after: "`", before: "`", placeholder: "코드" },
  italic: { after: "_", before: "_", placeholder: "기울일 내용" }
};

const LINE_PREFIXES = {
  bullet: { placeholder: "항목", prefix: "- " },
  heading: { placeholder: "소제목", prefix: "## " },
  ordered: { placeholder: "항목", prefix: "1. " },
  quote: { placeholder: "인용문", prefix: "> " }
};

const TOOLS = [
  { icon: Heading2, kind: "heading", label: "소제목" },
  { icon: Bold, kind: "bold", label: "굵게" },
  { icon: Italic, kind: "italic", label: "기울임" },
  { divider: true, kind: "divide-1" },
  { icon: List, kind: "bullet", label: "목록" },
  { icon: ListOrdered, kind: "ordered", label: "번호 목록" },
  { icon: Quote, kind: "quote", label: "인용" },
  { icon: Minus, kind: "rule", label: "구분선" },
  { divider: true, kind: "divide-2" },
  { icon: Link, kind: "link", label: "링크" },
  { icon: Code, kind: "code", label: "인라인 코드" },
  { icon: SquareCode, kind: "fence", label: "코드 블럭" }
];

/*
 * Builds the next value plus the selection to restore. Anything the caller did
 * not select becomes a placeholder that stays selected, so the next keystroke
 * overwrites it instead of landing after the snippet.
 */
function buildEdit(kind, value, start, end) {
  const selected = value.slice(start, end);
  const atLineStart = value.lastIndexOf("\n", start - 1) + 1 === start;

  if (kind === "fence") {
    const body = selected || "코드를 붙여 넣어요";
    const lead = atLineStart ? "" : "\n";
    const snippet = `${lead}\`\`\`\n${body}\n\`\`\`\n`;
    const from = start + lead.length + 4;
    return { from, snippet, to: from + body.length };
  }

  if (kind === "rule") {
    const snippet = `${atLineStart ? "" : "\n"}\n---\n\n`;
    const from = start + snippet.length;
    return { from, snippet, to: from };
  }

  if (kind === "link") {
    const text = selected || "링크 이름";
    const snippet = `[${text}](https://)`;
    const from = start + text.length + 3;
    return { from, snippet, to: from + "https://".length };
  }

  const wrapper = WRAPPERS[kind];
  if (wrapper) {
    /*
     * Whitespace has to stay outside the markers: `**강조 **` is not emphasis,
     * so a selection that catches a trailing space would render as literal
     * asterisks. Trim it off and put it back around the wrapped text.
     */
    const trimmed = selected.trim();
    const leading = trimmed ? selected.slice(0, selected.indexOf(trimmed)) : "";
    const trailing = trimmed ? selected.slice(leading.length + trimmed.length) : "";
    const body = trimmed || wrapper.placeholder;
    const snippet = `${leading}${wrapper.before}${body}${wrapper.after}${trailing}`;
    const from = start + leading.length + wrapper.before.length;
    return { from, snippet, to: from + body.length };
  }

  const line = LINE_PREFIXES[kind];
  const body = selected || line.placeholder;
  const lead = atLineStart && !selected ? "" : "\n";
  const snippet = `${lead}${line.prefix}${body}`;
  const from = start + lead.length + line.prefix.length;
  return { from, snippet, to: from + body.length };
}

export function MarkdownEditor({
  description = "",
  error,
  label = "모임 소개",
  maxLength = 10_000,
  name = "description",
  register,
  rows = 8,
  setValue,
  title = "모임 소개",
  value = ""
}) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef(null);
  const pendingSelection = useRef(null);
  const registration = register(name);

  useEffect(() => {
    const selection = pendingSelection.current;
    const node = textareaRef.current;
    if (!selection || !node) return;
    pendingSelection.current = null;
    node.focus();
    node.setSelectionRange(selection.from, selection.to);
  });

  function applyFormat(kind) {
    const node = textareaRef.current;
    if (!node) return;

    const { selectionEnd, selectionStart } = node;
    const current = node.value;
    const { from, snippet, to } = buildEdit(kind, current, selectionStart, selectionEnd);
    const next = `${current.slice(0, selectionStart)}${snippet}${current.slice(selectionEnd)}`;

    if (next.length > maxLength) return;

    pendingSelection.current = { from, to };
    setValue(name, next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="group-editor__markdown-editor">
      <div className="group-editor__description-heading">
        <h2>{title}</h2>
        <div className="group-editor__description-tools">
          <button
            aria-pressed={!preview}
            className={preview ? "" : "is-active"}
            onClick={() => setPreview(false)}
            type="button"
          >
            작성
          </button>
          <button
            aria-pressed={preview}
            className={preview ? "is-active" : ""}
            onClick={() => setPreview(true)}
            type="button"
          >
            미리보기
          </button>
        </div>
      </div>

      <div className="group-editor__markdown-toolbar" aria-label="마크다운 서식" role="toolbar">
        {TOOLS.map((tool) =>
          tool.divider ? (
            <span aria-hidden="true" className="group-editor__toolbar-divide" key={tool.kind} />
          ) : (
            <button
              aria-label={tool.label}
              disabled={preview}
              key={tool.kind}
              onClick={() => applyFormat(tool.kind)}
              title={tool.label}
              type="button"
            >
              <tool.icon aria-hidden="true" size={18} />
            </button>
          )
        )}
        <span className="group-editor__toolbar-count">
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>

      {preview ? (
        <div className="group-editor__markdown-preview" aria-label="모임 소개 미리보기">
          <MarkdownContent value={value} emptyText="작성한 소개가 여기에 표시돼요." />
        </div>
      ) : (
        <Textarea
          {...registration}
          description={description}
          error={error}
          label={label}
          maxLength={maxLength}
          ref={(node) => {
            textareaRef.current = node;
            registration.ref(node);
          }}
          rows={rows}
        />
      )}
    </div>
  );
}
