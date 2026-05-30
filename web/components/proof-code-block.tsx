import type { ProofCodeSnippet } from "@/lib/proof-library-types";

type ProofCodeBlockProps = {
  snippet: ProofCodeSnippet;
};

export function ProofCodeBlock({ snippet }: ProofCodeBlockProps) {
  const lines = snippet.content.split("\n");

  return (
    <figure className="proof-code-block">
      <div className="proof-code-header">
        <span className="proof-code-label">{snippet.label}</span>
        <span className="mono proof-code-path">{snippet.path}</span>
      </div>
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
              <code>{line || " "}</code>
            </div>
          );
        })}
      </pre>
      <figcaption className="proof-code-caption">
        {snippet.symbol ? (
          <>
            <code className="mono">{snippet.symbol}</code>
            {" · "}
          </>
        ) : null}
        <a href={snippet.github_url} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </figcaption>
    </figure>
  );
}
