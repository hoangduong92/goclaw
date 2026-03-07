import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useClipboard } from "@/hooks/use-clipboard";
import { Check, Copy } from "lucide-react";

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { copied, copy } = useClipboard();
  const text = String(children).replace(/\n$/, "");
  const lang = className?.replace("language-", "") ?? "";

  return (
    <div className="group relative">
      <div className="flex items-center justify-between rounded-t-md bg-muted px-3 py-1 text-xs text-muted-foreground">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={() => copy(text)}
          className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
          title="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none break-words ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm" {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            return (
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img
                  src={src}
                  alt={alt ?? "image"}
                  className="max-w-sm rounded-lg border shadow-sm"
                  loading="lazy"
                  {...props}
                />
              </a>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-sm" {...props}>{children}</table>
              </div>
            );
          },
          thead({ children, ...props }) {
            return <thead className="border-b bg-muted/50" {...props}>{children}</thead>;
          },
          th({ children, ...props }) {
            return <th className="px-3 py-2 text-left font-medium" {...props}>{children}</th>;
          },
          td({ children, ...props }) {
            return <td className="border-t px-3 py-2" {...props}>{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
