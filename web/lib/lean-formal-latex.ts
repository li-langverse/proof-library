const UNICODE_TO_LATEX: Record<string, string> = {
  "∀": "\\forall ",
  "∃": "\\exists ",
  "→": "\\to ",
  "↔": "\\leftrightarrow ",
  "∧": "\\land ",
  "∨": "\\lor ",
  "≤": "\\leq ",
  "≥": "\\geq ",
  "≠": "\\neq ",
  "∈": "\\in ",
  "⊆": "\\subseteq ",
  "⊂": "\\subset ",
  "×": "\\times ",
  "·": "\\cdot ",
  "ℝ": "\\mathbb{R}",
  "ℕ": "\\mathbb{N}",
  "ℤ": "\\mathbb{Z}",
  "ℚ": "\\mathbb{Q}",
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

  // Drop binders in the head for display-only math (body keeps quantifiers).
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

/** Turn catalog statement text into inline LaTeX where math symbols appear. */
export function statementToLatex(statement: string): string {
  const parts: string[] = [];
  let buf = "";
  for (const ch of statement) {
    if (UNICODE_TO_LATEX[ch]) {
      if (buf) {
        parts.push(`\\text{${escapeText(buf)}}`);
        buf = "";
      }
      parts.push(UNICODE_TO_LATEX[ch].trim());
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push(`\\text{${escapeText(buf)}}`);
  return parts.join(" ");
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[{}]/g, "\\$&");
}
