import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

function MarkdownImage({ alt = "", node: _node, ...properties }) {
  return <img {...properties} alt={alt} decoding="async" loading="lazy" />;
}

export function MarkdownContent({ className = "", emptyText, value = "" }) {
  return (
    <div className={["ui-markdown", className].filter(Boolean).join(" ")}>
      {value ? (
        <ReactMarkdown
          components={{ img: MarkdownImage }}
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
