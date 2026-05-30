"use client";

import katex from "katex";

type ProofFormalMathProps = {
  latex: string;
  display?: boolean;
  className?: string;
};

export function ProofFormalMath({ latex, display = true, className }: ProofFormalMathProps) {
  let html = "";
  try {
    html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    html = latex;
  }

  return (
    <div
      className={className ?? "proof-formal-math"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
