"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkifyProofIds } from "@/lib/proof-graph-utils";

type ProofMarkdownProps = {
  source: string;
  className?: string;
  knownNodeIds?: Set<string>;
  onNavigateToNode?: (id: string) => void;
};

export function ProofMarkdown({
  source,
  className = "",
  knownNodeIds,
  onNavigateToNode,
}: ProofMarkdownProps) {
  const processed = useMemo(() => {
    if (!knownNodeIds?.size) return source;
    return linkifyProofIds(source, knownNodeIds);
  }, [source, knownNodeIds]);

  return (
    <div className={`proof-markdown ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="proof-markdown-h1">{children}</h3>,
          h2: ({ children }) => <h4 className="proof-markdown-h2">{children}</h4>,
          h3: ({ children }) => <h5 className="proof-markdown-h3">{children}</h5>,
          p: ({ children }) => <p className="proof-markdown-p">{children}</p>,
          ul: ({ children }) => <ul className="proof-markdown-ul">{children}</ul>,
          ol: ({ children }) => <ol className="proof-markdown-ol">{children}</ol>,
          li: ({ children }) => <li className="proof-markdown-li">{children}</li>,
          code: ({ className: langClass, children, ...props }) => {
            const text = String(children).replace(/\n$/, "");
            const isBlock = langClass || text.includes("\n");
            if (isBlock) {
              const lang = langClass?.replace("language-", "") ?? "text";
              return (
                <pre className={`proof-markdown-pre mono language-${lang}`}>
                  <code {...props}>{text}</code>
                </pre>
              );
            }
            const idMatch = knownNodeIds?.has(text) ? text : null;
            if (idMatch && onNavigateToNode) {
              return (
                <button
                  type="button"
                  className="proof-markdown-node-link mono"
                  onClick={() => onNavigateToNode(idMatch)}
                >
                  {text}
                </button>
              );
            }
            return (
              <code className="proof-markdown-inline mono" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          a: ({ href, children }) => {
            if (href?.startsWith("proof-node:") && onNavigateToNode) {
              const id = href.slice("proof-node:".length);
              return (
                <button
                  type="button"
                  className="proof-markdown-node-link"
                  onClick={() => onNavigateToNode(id)}
                >
                  {children}
                </button>
              );
            }
            return (
              <a className="proof-markdown-link" href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          strong: ({ children }) => <strong className="proof-markdown-strong">{children}</strong>,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
