import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ className = "", emptyText, value = "" }) {
  return (
    <div className={["ui-markdown", className].filter(Boolean).join(" ")}>
      {value ? (
        <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]} remarkPlugins={[remarkGfm]}>
          {value}
        </ReactMarkdown>
      ) : emptyText ? (
        <p>{emptyText}</p>
      ) : null}
    </div>
  );
}
