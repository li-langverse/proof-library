import type { ProofCodeSnippet } from "@/lib/proof-library-types";

type CarbonCodeBlockProps = {
  snippet: ProofCodeSnippet;
};

export function CarbonCodeBlock({ snippet }: CarbonCodeBlockProps) {
  const lines = snippet.content.split("\n");

  return (
    <figure className="carbon-block">
      <div className="carbon-window">
        <div className="carbon-titlebar">
          <div className="carbon-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="carbon-filename mono">{snippet.path}</span>
          <span className="carbon-lang">{snippet.language.toUpperCase()}</span>
        </div>
        <pre className="carbon-code">
          {lines.map((line, idx) => {
            const lineNo = snippet.start_line + idx;
            const highlighted = lineNo === snippet.highlight_line;
            return (
              <div
                key={`${snippet.path}-${lineNo}`}
                className={highlighted ? "carbon-line carbon-line-hi" : "carbon-line"}
              >
                <span className="carbon-ln">{lineNo}</span>
                <code>{line || " "}</code>
              </div>
            );
          })}
        </pre>
      </div>
      <figcaption className="carbon-caption">
        {snippet.label}
        {snippet.symbol ? (
          <>
            {" · "}
            <code className="mono">{snippet.symbol}</code>
          </>
        ) : null}
        {" · "}
        <a href={snippet.github_url} target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </figcaption>
    </figure>
  );
}
