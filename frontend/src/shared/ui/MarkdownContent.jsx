import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

function MarkdownImage({ alt = "", node: _node, ...properties }) {
  return <img {...properties} alt={alt} decoding="async" loading="lazy" />;
}

function MarkdownTable({ children, node: _node, ...properties }) {
  return (
    // The focusable region lets keyboard users scroll wide tables horizontally.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- This region is intentionally focusable for keyboard scrolling.
    <div aria-label="표" className="ui-markdown__table-wrap" role="region" tabIndex={0}>
      <table {...properties}>{children}</table>
    </div>
  );
}

export function MarkdownContent({ className = "", emptyText, value = "" }) {
  return (
    <div className={["ui-markdown", className].filter(Boolean).join(" ")}>
      {value ? (
        <ReactMarkdown
          components={{ img: MarkdownImage, table: MarkdownTable }}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          remarkPlugins={[remarkGfm]}
        >
          {value}
        </ReactMarkdown>
      ) : emptyText ? (
        <p>{emptyText}</p>
      ) : null}
    </div>
  );
}
