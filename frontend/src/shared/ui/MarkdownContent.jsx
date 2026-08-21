import { Fragment } from "react";

const INLINE_PATTERN = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\))/g;

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

function renderInline(value, keyPrefix) {
  const nodes = [];
  let cursor = 0;
  let match;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    if (match[2]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{match[2]}</strong>);
    } else {
      const properties = linkProperties(match[4]);
      nodes.push(
        properties ? (
          <a {...properties} key={`${keyPrefix}-link-${match.index}`}>
            {match[3]}
          </a>
        ) : (
          <Fragment key={`${keyPrefix}-text-${match.index}`}>{match[3]}</Fragment>
        )
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function isBlockStart(line) {
  return /^##\s+/.test(line) || /^-\s+/.test(line) || /^>\s?/.test(line);
}

export function MarkdownContent({ className = "", emptyText, value = "" }) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      blocks.push(
        <h2 key={`heading-${index}`}>{renderInline(line.replace(/^##\s+/, ""), index)}</h2>
      );
      index += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items = [];
      const start = index;
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`list-${start}`}>
          {items.map((item, itemIndex) => (
            <li key={`${start}-${itemIndex}`}>{renderInline(item, `${start}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quotes = [];
      const start = index;
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quotes.push(lines[index].replace(/^>\s?/, ""));
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
