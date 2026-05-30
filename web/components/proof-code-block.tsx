import { highlightLine } from "@/lib/code-highlight";
import type { ProofCodeSnippet } from "@/lib/proof-library-types";

type SnippetProps = {
  snippet: ProofCodeSnippet;
};

export function ProofCodeHeader({ snippet }: SnippetProps) {
  return (
    <div className="proof-code-header">
      <span className="proof-code-label">{snippet.label}</span>
      <span className="mono proof-code-path" title={snippet.path}>
        {snippet.path}
      </span>
    </div>
  );
}

export function ProofCodeBody({ snippet }: SnippetProps) {
  const lines = snippet.content.split("\n");

  return (
    <pre className="proof-code-pre">
      {lines.map((line, idx) => {
        const lineNo = snippet.start_line + idx;
        const highlighted = lineNo === snippet.highlight_line;
        return (
          <div
            key={`${snippet.path}-${lineNo}`}
            className={highlighted ? "proof-code-line proof-code-line-hi" : "proof-code-line"}
          >
            <span className="proof-code-ln">{lineNo}</span>
            <code
              className={`proof-code-src lang-${snippet.language}`}
              dangerouslySetInnerHTML={{
                __html: highlightLine(snippet.language, line || " "),
              }}
            />
          </div>
        );
      })}
    </pre>
  );
}

export function ProofCodeFooter({ snippet }: SnippetProps) {
  return (
    <figcaption className="proof-code-caption">
      {snippet.symbol ? (
        <>
          <code className="mono">{snippet.symbol}</code>
          <span className="proof-code-caption-sep"> · </span>
        </>
      ) : null}
      <a href={snippet.github_url} target="_blank" rel="noopener noreferrer">
        GitHub
      </a>
    </figcaption>
  );
}

export function ProofCodeBlock({ snippet }: SnippetProps) {
  return (
    <figure className="proof-code-block">
      <ProofCodeHeader snippet={snippet} />
      <ProofCodeBody snippet={snippet} />
      <ProofCodeFooter snippet={snippet} />
    </figure>
  );
}

type ProofCodeGridProps = {
  snippets: ProofCodeSnippet[];
};

export function ProofCodeGrid({ snippets }: ProofCodeGridProps) {
  return (
    <div className="proof-code-layout">
      <div className="proof-code-stack">
        {snippets.map((snippet) => (
          <ProofCodeBlock key={snippet.role} snippet={snippet} />
        ))}
      </div>
      <div className="proof-code-matrix" aria-label="Source implementations">
        <div className="proof-code-matrix-row proof-code-matrix-headers">
          {snippets.map((snippet) => (
            <ProofCodeHeader key={`h-${snippet.role}`} snippet={snippet} />
          ))}
        </div>
        <div className="proof-code-matrix-row proof-code-matrix-bodies">
          {snippets.map((snippet) => (
            <ProofCodeBody key={`b-${snippet.role}`} snippet={snippet} />
          ))}
        </div>
        <div className="proof-code-matrix-row proof-code-matrix-footers">
          {snippets.map((snippet) => (
            <ProofCodeFooter key={`f-${snippet.role}`} snippet={snippet} />
          ))}
        </div>
      </div>
    </div>
  );
}
