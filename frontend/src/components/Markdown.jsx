import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

// Turn "[Material: Title]" / "[Source]" citations from the tutor into chips.
const CITE = /\[(Material:[^\]]+|Source)\]/g;

function withCitations(children) {
  if (typeof children !== "string") return children;
  const parts = children.split(CITE);
  if (parts.length === 1) return children;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="cite">
        {p.replace(/^Material:\s*/, "")}
      </mark>
    ) : (
      p
    ),
  );
}

const mapChildren = (children) => (Array.isArray(children) ? children.map((c) => withCitations(c)) : withCitations(children));

const components = {
  a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  p: ({ node: _n, children, ...props }) => <p {...props}>{mapChildren(children)}</p>,
  li: ({ node: _n, children, ...props }) => <li {...props}>{mapChildren(children)}</li>,
  table: ({ node: _n, ...props }) => (
    <div className="not-prose my-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:bg-surface-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold" {...props} />
    </div>
  ),
};

/** Normalise \( \) and \[ \] LaTeX delimiters (common in model output) to $ / $$. */
const normaliseMath = (s) =>
  s
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);

export const Markdown = memo(function Markdown({ children, className }) {
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]} components={components}>
        {normaliseMath(String(children ?? ""))}
      </ReactMarkdown>
    </div>
  );
});
