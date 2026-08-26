import { Fragment } from "react";

/*
 * Inline rules run in one alternation so the first match wins at each position.
 * Order matters twice over: code spans come first so their contents stay literal,
 * and the two-character emphasis markers come before the one-character ones so
 * `**굵게**` is not read as two nested italics.
 *
 * `_` is deliberately stricter than `*`: it only opens and closes at a word
 * boundary, which keeps identifiers such as user_name_value out of the parser.
 */
const INLINE_SOURCE = [
  "(`[^`]+`)",
  "(\\*\\*(?=\\S)[\\s\\S]+?(?<=\\S)\\*\\*)",
  "((?<!\\w)__(?=\\S)[\\s\\S]+?(?<=\\S)__(?!\\w))",
  "(\\*(?=[^\\s*])[\\s\\S]+?(?<=[^\\s*])\\*)",
  "((?<!\\w)_(?=[^\\s_])[\\s\\S]+?(?<=[^\\s_])_(?!\\w))",
  "(\\[[^\\]]+\\]\\([^)\\s]+\\))"
].join("|");

const FENCE_PATTERN = /^\s*(?:```|~~~)/;
const THEMATIC_BREAK_PATTERN = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING_PATTERN = /^ {0,3}(#{1,3})\s*(\S.*)$/;
/* A bullet needs whitespace after the marker, otherwise `**굵게**` opens a list. */
const BULLET_PATTERN = /^\s*(?:[-*][ \t]+\S|-[^\s*-])/;
const ORDERED_PATTERN = /^\s*\d+[.)][ \t]*\S/;
const QUOTE_PATTERN = /^>\s?/;

function linkProperties(url) {
  if (url.startsWith("/") || url.startsWith("#")) return { href: url };
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { href: parsed.href, rel: "noreferrer noopener", target: "_blank" };
    }
  } catch {
    return null;
  }
  return null;
}

function renderLink(token, key) {
  const split = token.indexOf("](");
  const text = token.slice(1, split);
  const url = token.slice(split + 2, -1);
  const properties = linkProperties(url);
  return properties ? (
    <a {...properties} key={key}>
      {text}
    </a>
  ) : (
    <Fragment key={key}>{text}</Fragment>
  );
}

function renderInline(value, keyPrefix) {
  const nodes = [];
  let cursor = 0;
  let match;

  /* renderInline recurses for nested emphasis, so each call needs its own
   * lastIndex — a shared global regex would be rewound by the inner call. */
  const pattern = new RegExp(INLINE_SOURCE, "g");
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const key = `${keyPrefix}-${match.index}`;
    const [token, code, starBold, underscoreBold, starItalic, underscoreItalic, link] = match;

    if (code) {
      nodes.push(<code key={key}>{code.slice(1, -1)}</code>);
    } else if (starBold || underscoreBold) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (starItalic || underscoreItalic) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else if (link) {
      nodes.push(renderLink(token, key));
    }

    cursor = match.index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function isBlockStart(line) {
  return (
    FENCE_PATTERN.test(line) ||
    THEMATIC_BREAK_PATTERN.test(line) ||
    HEADING_PATTERN.test(line) ||
    BULLET_PATTERN.test(line) ||
    ORDERED_PATTERN.test(line) ||
    QUOTE_PATTERN.test(line)
  );
}

function collectListItems(lines, index, pattern, strip) {
  const items = [];
  while (index < lines.length && pattern.test(lines[index])) {
    items.push(lines[index].replace(strip, ""));
    index += 1;
  }
  return [items, index];
}

export function MarkdownContent({ className = "", emptyText, value = "" }) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    /* Fences are consumed first so their contents never reach the inline parser. */
    if (FENCE_PATTERN.test(line)) {
      const start = index;
      const code = [];
      index += 1;
      while (index < lines.length && !FENCE_PATTERN.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      /* An unclosed fence still renders, so a half-typed block is never swallowed. */
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${start}`}>
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (THEMATIC_BREAK_PATTERN.test(line)) {
      blocks.push(<hr key={`break-${index}`} />);
      index += 1;
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      /* The page around this content already owns the h1, so `#` and `##` both
       * land on h2 — that also keeps headings in existing descriptions, which
       * were written with `##`, at the level they have always rendered at. */
      const Tag = heading[1].length === 3 ? "h3" : "h2";
      blocks.push(<Tag key={`heading-${index}`}>{renderInline(heading[2], index)}</Tag>);
      index += 1;
      continue;
    }

    if (BULLET_PATTERN.test(line)) {
      const start = index;
      const [items, next] = collectListItems(lines, index, BULLET_PATTERN, /^\s*[-*][ \t]*/);
      index = next;
      blocks.push(
        <ul key={`list-${start}`}>
          {items.map((item, itemIndex) => (
            <li key={`${start}-${itemIndex}`}>{renderInline(item, `${start}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (ORDERED_PATTERN.test(line)) {
      const start = index;
      const [items, next] = collectListItems(lines, index, ORDERED_PATTERN, /^\s*\d+[.)][ \t]*/);
      index = next;
      blocks.push(
        <ol key={`ordered-${start}`}>
          {items.map((item, itemIndex) => (
            <li key={`${start}-${itemIndex}`}>{renderInline(item, `${start}-${itemIndex}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (QUOTE_PATTERN.test(line)) {
      const start = index;
      const quotes = [];
      while (index < lines.length && QUOTE_PATTERN.test(lines[index])) {
        quotes.push(lines[index].replace(QUOTE_PATTERN, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${start}`}>{renderInline(quotes.join(" "), start)}</blockquote>
      );
      continue;
    }

    const paragraphs = [line.trim()];
    const start = index;
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphs.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${start}`}>{renderInline(paragraphs.join(" "), start)}</p>);
  }

  return (
    <div className={["ui-markdown", className].filter(Boolean).join(" ")}>
      {blocks.length ? blocks : emptyText ? <p>{emptyText}</p> : null}
    </div>
  );
}
