/** Lightweight Lean → KaTeX conversion for formal drilldown blocks. */

const UNICODE_TO_LATEX: Record<string, string> = {
  "\u2200": "\\forall ",
  "\u2203": "\\exists ",
  "\u2192": "\\to ",
  "\u2194": "\\leftrightarrow ",
  "\u2227": "\\land ",
  "\u2228": "\\lor ",
  "\u2264": "\\leq ",
  "\u2265": "\\geq ",
  "\u2260": "\\neq ",
  "\u2208": "\\in ",
  "\u2286": "\\subseteq ",
  "\u2282": "\\subset ",
  "\u00d7": "\\times ",
  "\u22c5": "\\cdot ",
  "\u211d": "\\mathbb{R}",
  "\u2115": "\\mathbb{N}",
  "\u2124": "\\mathbb{Z}",
  "\u03b3": "\\gamma",
  "\u03b2": "\\beta",
  "\u03b1": "\\alpha",
  "\u03c4": "\\tau",
  "\u221a": "\\sqrt",
  "\u2212": "-",
  "\u00b2": "^2",
  "\u00b3": "^3",
};

function replaceUnicodeMath(input: string): string {
  let out = input;
  for (const [char, latex] of Object.entries(UNICODE_TO_LATEX)) {
    out = out.split(char).join(latex);
  }
  return out;
}

function replaceLeanTokens(input: string): string {
  return input
    .replace(/\bNat\.succ\b/g, "\\operatorname{succ}")
    .replace(/\bNat\b/g, "\\mathbb{N}")
    .replace(/\bProp\b/g, "\\mathrm{Prop}")
    .replace(/\bReal\b/g, "\\mathbb{R}")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the type expression from a Lean axiom/theorem/def declaration line. */
export function extractLeanTypeExpr(content: string): string | null {
  const decl = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^(axiom|theorem|def|lemma)\s/.test(line));
  if (!decl) return null;

  const colonIdx = decl.indexOf(":");
  if (colonIdx === -1) return null;

  const head = decl.slice(0, colonIdx);
  const body = decl.slice(colonIdx + 1).trim();
  if (!body || body === "Prop") return null;

  if (/^(axiom|theorem|lemma)\s+\S+\s*\(/.test(head) && body.startsWith("(")) {
    return body;
  }
  return body;
}

/** Convert Lean formal text to a KaTeX display string. */
export function leanFormalToLatex(content: string): string | null {
  const expr = extractLeanTypeExpr(content);
  if (!expr) return null;
  return replaceLeanTokens(replaceUnicodeMath(expr));
}

/** Convert catalog statement text (unicode physics/math) to KaTeX. */
export function statementToLatex(statement: string | null | undefined): string | null {
  if (!statement?.trim()) return null;
  const text = statement.trim();
  if (text.includes("\\") || text.includes("$")) {
    return text.replace(/\$/g, "").trim();
  }
  let latex = replaceUnicodeMath(text);
  latex = latex.replace(/O\(h\^2\)/g, "O(h^{2})");
  latex = latex.replace(/mc²/g, "mc^2");
  return latex.replace(/\s+/g, " ").trim() || null;
}